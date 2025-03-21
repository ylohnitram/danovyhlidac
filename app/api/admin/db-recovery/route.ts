import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Gets a list of all tables in the database
 */
async function listAllTables() {
  try {
    const tables = await prisma.$queryRaw`
      SELECT 
        tablename, 
        tableowner,
        (SELECT count(*) FROM pg_indexes WHERE tablename=pg_tables.tablename) AS index_count,
        (SELECT count(*) FROM information_schema.columns WHERE table_name=pg_tables.tablename) AS column_count
      FROM pg_tables 
      WHERE schemaname='public'
      ORDER BY tablename;
    `;
    return tables;
  } catch (error) {
    console.error('Error listing tables:', error);
    return [];
  }
}

/**
 * Checks if a table exists
 */
async function tableExists(tableName: string) {
  try {
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = ${tableName}
      ) as exists;
    `;
    return result[0]?.exists || false;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

/**
 * Gets column information for a table
 */
async function getTableColumns(tableName: string) {
  try {
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = ${tableName}
      ORDER BY ordinal_position;
    `;
    return columns;
  } catch (error) {
    console.error(`Error getting columns for table ${tableName}:`, error);
    return [];
  }
}

/**
 * Gets row count for a table
 */
async function getTableRowCount(tableName: string) {
  try {
    const query = `SELECT COUNT(*) as count FROM "${tableName}"`;
    const result = await prisma.$queryRawUnsafe(query);
    return result[0]?.count || 0;
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
    
    // Check if target table already has data
    const targetCount = await getTableRowCount(targetName);
    if (targetCount > 0) {
      return {
        success: false,
        message: `Target table ${targetName} already has ${targetCount} rows. Clear it first to avoid duplicates.`
      };
    }
    
    // Copy data
    const query = `INSERT INTO "${targetName}" (${columnsList}) SELECT ${columnsList} FROM "${sourceName}"`;
    await prisma.$queryRawUnsafe(query);
    
    // Count migrated rows
    const migratedCount = await getTableRowCount(targetName);
    
    return {
      success: true,
      message: `Successfully migrated ${migratedCount} rows from ${sourceName} to ${targetName}`,
      migratedRows: migratedCount,
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

/**
 * The main recovery process
 */
async function runDatabaseRecovery() {
  try {
    // List all tables
    const allTables = await listAllTables();
    
    // Map of case-insensitive table names to their actual names
    const tableMap = {};
    for (const table of allTables) {
      tableMap[table.tablename.toLowerCase()] = table.tablename;
    }
    
    // Define target tables (lowercase)
    const targetTables = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    
    // Recovery results
    const recoveryResults = [];
    
    // Check and migrate each table
    for (const targetTable of targetTables) {
      // Find potential source tables with similar names
      const potentialSources = Object.keys(tableMap)
        .filter(name => name.toLowerCase() === targetTable.toLowerCase() && name !== targetTable);
      
      if (potentialSources.length > 0) {
        const sourceTable = tableMap[potentialSources[0]];
        
        // Check if source table has data
        const sourceCount = await getTableRowCount(sourceTable);
        if (sourceCount > 0) {
          // Target table exists and is different from source
          if (await tableExists(targetTable) && targetTable !== sourceTable) {
            // Migrate data
            const migrationResult = await migrateData(sourceTable, targetTable);
            recoveryResults.push({
              source: sourceTable,
              target: targetTable,
              result: migrationResult
            });
          } else {
            recoveryResults.push({
              source: sourceTable,
              target: targetTable,
              result: {
                success: false,
                message: `Target table ${targetTable} doesn't exist or is the same as source`
              }
            });
          }
        } else {
          recoveryResults.push({
            source: sourceTable,
            target: targetTable,
            result: {
              success: false,
              message: `Source table ${sourceTable} has no data to migrate`
            }
          });
        }
      } else {
        recoveryResults.push({
          target: targetTable,
          result: {
            success: false,
            message: `No source table found for ${targetTable}`
          }
        });
      }
    }
    
    return {
      allTables,
      tableMap,
      recoveryResults
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function GET() {
  try {
    // List all tables for diagnostic purposes
    const tables = await listAllTables();
    
    // Get row counts for tables that match our expected names (case-insensitive)
    const tableCounts = [];
    for (const table of tables) {
      const count = await getTableRowCount(table.tablename);
      tableCounts.push({
        name: table.tablename,
        count
      });
    }
    
    return NextResponse.json({
      tables,
      tableCounts
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await runDatabaseRecovery();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
