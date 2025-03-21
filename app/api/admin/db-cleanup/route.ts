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
 * Check if a table exists (exact match)
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = ${tableName}
      ) as exists
    `;
    
    return result[0]?.exists === true;
  } catch (error) {
    console.error(`Error checking table existence for ${tableName}:`, error);
    return false;
  }
}

/**
 * Drops a table from the database
 */
async function dropTable(tableName: string) {
  try {
    // First check if the table actually exists
    if (!(await tableExists(tableName))) {
      return { 
        success: false, 
        table: tableName,
        error: `Tabulka "${tableName}" nebyla nalezena`
      };
    }

    // Use this approach to drop foreign key constraints
    try {
      // Get all foreign key constraints referencing this table
      const constraints = await prisma.$queryRaw`
        SELECT con.conname, rel.relname as table_name 
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_class rel2 ON rel2.oid = con.confrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel2.relname = ${tableName}
        AND nsp.nspname = 'public'
        AND con.contype = 'f'
      `;

      // Drop each constraint
      for (const constraint of constraints as any[]) {
        const dropConstraintQuery = `
          ALTER TABLE "${constraint.table_name}" 
          DROP CONSTRAINT IF EXISTS "${constraint.conname}"
        `;
        await prisma.$executeRawUnsafe(dropConstraintQuery);
      }
    } catch (constraintError) {
      console.warn(`Warning while dropping constraints for ${tableName}:`, constraintError);
      // Continue anyway to try dropping the table
    }

    // Now drop the table with proper quoting
    const dropTableQuery = `DROP TABLE IF EXISTS "${tableName}" CASCADE`;
    await prisma.$executeRawUnsafe(dropTableQuery);
    
    return { 
      success: true, 
      table: tableName, 
      message: "Tabulka úspěšně odstraněna" 
    };
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
    
    // Drop each table and collect results
    const results = [];
    for (const tableName of validTablesToRemove) {
      const result = await dropTable(tableName);
      results.push(result);
    }
    
    return NextResponse.json({
      success: results.some((r: any) => r.success),
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
