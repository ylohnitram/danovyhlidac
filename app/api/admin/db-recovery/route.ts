import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Gets a list of all tables in the database with simplified query
 */
async function listAllTables() {
  try {
    const tables = await prisma.$queryRaw`
      SELECT tablename, tableowner
      FROM pg_tables 
      WHERE schemaname='public'
      ORDER BY tablename;
    `;
    
    console.log('Tables found:', tables);
    return tables;
  } catch (error) {
    console.error('Error listing tables:', error);
    throw error; // Re-throw to handle in the main handler
  }
}

/**
 * Gets column information for a table with safer query
 */
async function getTableColumns(tableName: string) {
  try {
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns
      WHERE table_name = ${tableName}
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;
    return columns;
  } catch (error) {
    console.error(`Error getting columns for table ${tableName}:`, error);
    return [];
  }
}

/**
 * Gets row count for a table with safer query
 */
async function getTableRowCount(tableName: string) {
  try {
    // Use a safer approach with $executeRawUnsafe
    const query = `SELECT COUNT(*) as count FROM "${tableName}"`;
    const result = await prisma.$executeRawUnsafe(query);
    return result;
  } catch (error) {
    console.error(`Error getting row count for table ${tableName}:`, error);
    return 0;
  }
}

/**
 * Migrate data from one table to another while preserving structure
 */
async function migrateData(sourceName: string, targetName: string) {
  try {
    // Get column information to ensure compatible structure
    const sourceColumns = await getTableColumns(sourceName);
    const targetColumns = await getTableColumns(targetName);
    
    // Extract column names
    const sourceColumnNames = sourceColumns.map((col: any) => col.column_name);
    const targetColumnNames = targetColumns.map((col: any) => col.column_name);
    
    // Find common columns
    const commonColumns = sourceColumnNames.filter(col => 
      targetColumnNames.includes(col)
    );
    
    if (commonColumns.length === 0) {
      return {
        success: false,
        message: `No common columns found between ${sourceName} and ${targetName}`
      };
    }
    
    // Format columns for SQL query
    const columnsList = commonColumns.map(col => `"${col}"`).join(', ');
    
    // Copy data
    const query = `INSERT INTO "${targetName}" (${columnsList}) SELECT ${columnsList} FROM "${sourceName}"`;
    await prisma.$executeRawUnsafe(query);
    
    return {
      success: true,
      message: `Successfully migrated data from ${sourceName} to ${targetName}`,
      columns: commonColumns
    };
  } catch (error) {
    console.error(`Error migrating data from ${sourceName} to ${targetName}:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function GET() {
  try {
    // Simplified approach - just list tables
    const tables = await listAllTables();
    
    // Add basic table counts if possible
    const tableCounts = [];
    for (const table of tables) {
      try {
        const count = await getTableRowCount(table.tablename);
        tableCounts.push({
          name: table.tablename,
          count
        });
      } catch (countError) {
        console.error(`Error counting rows in ${table.tablename}:`, countError);
        tableCounts.push({
          name: table.tablename,
          count: 'Error',
          error: countError instanceof Error ? countError.message : String(countError)
        });
      }
    }
    
    return NextResponse.json({
      tables,
      tableCounts
    });
  } catch (error) {
    console.error('Error in GET handler:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    // List all tables
    const tables = await listAllTables();
    
    // Check if we have both uppercase and lowercase versions of tables
    const tableNames = tables.map(t => t.tablename);
    const recoveryPairs = [];
    
    // Look for potential pairs (case-insensitive matches that aren't identical)
    for (const tableName of tableNames) {
      const lowerName = tableName.toLowerCase();
      
      // Skip if the name is already lowercase
      if (tableName === lowerName) continue;
      
      // Check if we have the lowercase version
      if (tableNames.includes(lowerName)) {
        recoveryPairs.push({
          source: tableName,
          target: lowerName
        });
      }
    }
    
    // Process each recovery pair
    const results = [];
    for (const pair of recoveryPairs) {
      const result = await migrateData(pair.source, pair.target);
      results.push({
        ...pair,
        result
      });
    }
    
    return NextResponse.json({
      success: true,
      recoveryPairs,
      results
    });
  } catch (error) {
    console.error('Error in POST handler:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}
