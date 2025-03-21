import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Gets all tables in the database
 */
async function getAllTables() {
  try {
    const tables = await prisma.$queryRaw`
      SELECT tablename, schemaname
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    return tables;
  } catch (error) {
    console.error("Error getting all tables:", error);
    throw error;
  }
}

/**
 * Gets exact table name with case sensitivity preserved
 */
async function getExactTableName(tableName: string): Promise<string | null> {
  try {
    const result = await prisma.$queryRaw`
      SELECT tablename FROM pg_tables 
      WHERE schemaname='public' 
      AND LOWER(tablename)=LOWER(${tableName})
    `;
    
    if (Array.isArray(result) && result.length > 0) {
      return result[0].tablename;
    }
    return null;
  } catch (error) {
    console.error(`Error getting exact table name for ${tableName}:`, error);
    return null;
  }
}

/**
 * Drops a table from the database
 */
async function dropTable(tableName: string) {
  try {
    // Drop any foreign key constraints first
    const dropConstraintsQuery = `
      DO $$ 
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT conname, conrelid::regclass AS table_name
          FROM pg_constraint
          WHERE confrelid = '${tableName}'::regclass
        ) LOOP
          EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT IF EXISTS ' || r.conname;
        END LOOP;
      END $$;
    `;
    
    await prisma.$executeRawUnsafe(dropConstraintsQuery);
    
    // Now drop the table
    const dropTableQuery = `DROP TABLE IF EXISTS "${tableName}" CASCADE`;
    await prisma.$executeRawUnsafe(dropTableQuery);
    
    return { success: true, table: tableName, message: "Tabulka úspěšně odstraněna" };
  } catch (error) {
    console.error(`Error dropping table ${tableName}:`, error);
    return { 
      success: false, 
      table: tableName,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Analyzes tables and finds ones with case inconsistencies
 */
async function analyzeTables() {
  try {
    // Get all tables
    const allTables = await getAllTables();
    const tableNames = allTables.map((t: any) => t.tablename);
    
    // Standard table names (lowercase)
    const standardTables = ['smlouva', 'dodavatel', 'dodatek', 'podnet', '_prisma_migrations'];
    
    // Tables to remove - case inconsistencies
    const tablesToRemove = [];
    
    // Check each table for case inconsistencies
    for (const tableName of tableNames) {
      const lowerName = tableName.toLowerCase();
      
      // If it's a standard table name but with different case
      if (standardTables.includes(lowerName) && tableName !== lowerName) {
        tablesToRemove.push({
          name: tableName,
          reason: `Nekonzistentní velikost písmen (${lowerName} vs ${tableName})`,
          original: lowerName
        });
      }
    }
    
    // Unknown tables - not in standard list and not prisma-related
    const unknownTables = tableNames
      .filter(name => {
        const lowerName = name.toLowerCase();
        // Not a standard table (with any case)
        return !standardTables.includes(lowerName) &&
               // Not a Prisma managed table
               !name.startsWith('_prisma_') &&
               // Not a PostgreSQL system table
               !name.startsWith('pg_') &&
               !name.startsWith('sql_');
      })
      .map(name => ({
        name,
        reason: 'Neznámá tabulka, není v seznamu standardních tabulek'
      }));
    
    // Tables safe to keep - case correct or system tables
    const safeToKeep = tableNames
      .filter(name => {
        const lowerName = name.toLowerCase();
        // Standard table with correct case
        return (standardTables.includes(lowerName) && name === lowerName) ||
               // Prisma system table
               name.startsWith('_prisma_');
      })
      .map(name => ({
        name
      }));
    
    return {
      tablesToRemove,
      unknownTables,
      safeToKeep
    };
  } catch (error) {
    console.error("Error analyzing tables:", error);
    throw error;
  }
}

export async function GET() {
  try {
    const tablesInfo = await analyzeTables();
    
    return NextResponse.json({
      tables: tablesInfo
    });
  } catch (error) {
    console.error("Error in GET handler:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const includeUnknown = url.searchParams.get('includeUnknown') === 'true';
    
    // Parse the request body to get the tables to remove
    const data = await request.json();
    const tablesToRemove = data.tables || [];
    
    if (tablesToRemove.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Nejsou vybrány žádné tabulky k odstranění"
      }, { status: 400 });
    }
    
    // Analyze tables to confirm which ones should be removed
    const analysis = await analyzeTables();
    
    // Validate the tables to remove
    const validTablesToRemove = tablesToRemove.filter((table: string) => {
      // Tables marked for removal are always valid
      const isMarkedForRemoval = analysis.tablesToRemove.some(t => t.name === table);
      
      // Unknown tables are valid only if includeUnknown is true
      const isUnknown = analysis.unknownTables.some(t => t.name === table);
      
      return isMarkedForRemoval || (includeUnknown && isUnknown);
    });
    
    if (validTablesToRemove.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Žádná z vybraných tabulek není platná pro odstranění"
      }, { status: 400 });
    }
    
    // Drop each table
    const results = [];
    for (const tableName of validTablesToRemove) {
      const result = await dropTable(tableName);
      results.push(result);
    }
    
    return NextResponse.json({
      success: results.every((r: any) => r.success),
      results
    });
  } catch (error) {
    console.error("Error in POST handler:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
