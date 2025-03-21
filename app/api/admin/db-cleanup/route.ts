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
    
    return { success: true, tableName };
  } catch (error) {
    console.error(`Error dropping table ${tableName}:`, error);
    return { 
      success: false, 
      tableName,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Clean up database by removing unwanted tables
 */
export async function GET(request: Request) {
  try {
    // Get all tables in the database
    const allTables = await getAllTables();
    
    // Return list of tables
    return NextResponse.json({
      tables: allTables
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
    // Get the mode from the request
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'list';
    
    // Get all tables
    const allTables = await getAllTables();
    
    if (mode === 'list') {
      // Just return the list of tables
      return NextResponse.json({
        tables: allTables
      });
    }
    
    // The tables we want to keep (lowercase)
    const validTables = ['smlouva', 'dodavatel', 'dodatek', 'podnet', '_prisma_migrations'];
    
    // Find tables to delete
    const tablesToDelete = allTables.filter((table: any) => {
      // Keep tables that are exactly in our valid list
      if (validTables.includes(table.tablename)) {
        return false;
      }
      
      // Check for tables with the same name but different case
      const lowerName = table.tablename.toLowerCase();
      if (validTables.includes(lowerName) && lowerName !== table.tablename) {
        return true;
      }
      
      // Keep system tables
      if (table.tablename.startsWith('pg_') || 
          table.tablename.startsWith('sql_') || 
          table.tablename.startsWith('information_schema')) {
        return false;
      }
      
      // For 'cleanup-all' mode, delete all non-valid tables
      // For 'cleanup-case' mode, only delete tables with case issues
      if (mode === 'cleanup-all') {
        return true;
      } else if (mode === 'cleanup-case') {
        // Only delete tables that have same-named lowercase versions
        return validTables.includes(table.tablename.toLowerCase());
      }
      
      return false;
    });
    
    // If there are no tables to delete, return early
    if (tablesToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No tables to delete",
        tables: allTables
      });
    }
    
    // Drop each table
    const results = [];
    for (const table of tablesToDelete) {
      const result = await dropTable(table.tablename);
      results.push(result);
    }
    
    // Get updated list of tables
    const updatedTables = await getAllTables();
    
    return NextResponse.json({
      success: results.every((r: any) => r.success),
      deletedTables: results,
      remainingTables: updatedTables
    });
  } catch (error) {
    console.error("Error in POST handler:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
