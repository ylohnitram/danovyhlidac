import { PrismaClient } from '@prisma/client'

// Ensure PrismaClient is only initialized on the server side
const prisma = 
  typeof window === 'undefined' ? new PrismaClient() : undefined as any

/**
 * Checks if the database schema is set up correctly
 * 
 * Note: Direct migration execution through JavaScript API is not supported in edge environments.
 * Migrations should be run during deployment or through database initialization scripts.
 */
export async function ensureDatabaseSetup(): Promise<{ 
  success: boolean; 
  message: string;
  migrationRun: boolean;
}> {
  try {
    // Try a simple query to check if the schema exists
    await prisma.smlouva.count()
    
    return {
      success: true,
      message: "Database schema is properly set up",
      migrationRun: false
    }
  } catch (error: any) {
    // If the error indicates the schema doesn't exist, log the issue
    // In edge environments, we can't run migrations directly
    if (error.message?.includes('does not exist') || 
        error.code === 'P2010' || 
        error.meta?.details?.includes('does not exist')) {
      
      console.log('Database schema issue detected.')
      
      // In edge environments, we can only report the issue
      return {
        success: false,
        message: "Database schema not set up. Migrations should be run during deployment.",
        migrationRun: false
      }
    } else {
      // If it's a different error, just return it
      return {
        success: false,
        message: `Database error: ${error.message}`,
        migrationRun: false
      }
    }
  }
}

/**
 * Checks database connection and provides details about the state
 * 
 * This function attempts to check if the database is accessible and if the schema is set up,
 * but doesn't try to modify the database in any way.
 */
export async function checkDatabaseStatus(): Promise<{
  connected: boolean;
  hasSchema: boolean;
  tables: string[];
  error?: string;
}> {
  try {
    // Try a raw query to check connection and list tables
    // This should work in both edge and node.js environments as it's just a query
    const tables = await prisma.$queryRaw<{tablename: string}[]>`
      SELECT tablename FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
    `
    
    return {
      connected: true,
      hasSchema: tables.some(t => t.tablename === 'smlouva'),
      tables: tables.map(t => t.tablename)
    }
  } catch (error: any) {
    return {
      connected: false,
      hasSchema: false,
      tables: [],
      error: error.message
    }
  }
}
