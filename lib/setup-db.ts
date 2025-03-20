import { PrismaClient } from '@prisma/client'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const prisma = new PrismaClient()

/**
 * Checks if the database schema is set up correctly and attempts to run migrations if needed
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
    // If the error indicates the schema doesn't exist, try to run migrations
    if (error.message?.includes('does not exist') || 
        error.code === 'P2010' || 
        error.meta?.details?.includes('does not exist')) {
      
      console.log('Database schema issue detected. Attempting to run migrations...')
      
      try {
        // Run Prisma migrations
        const { stdout, stderr } = await execAsync('npx prisma migrate deploy')
        
        console.log('Migration output:', stdout)
        
        if (stderr && !stderr.includes('No pending migrations')) {
          console.error('Migration stderr:', stderr)
        }
        
        // Check again if the schema is now properly set up
        try {
          await prisma.smlouva.count()
          return {
            success: true, 
            message: "Successfully applied database migrations",
            migrationRun: true
          }
        } catch (secondError) {
          return {
            success: false,
            message: "Applied migrations but schema still not accessible",
            migrationRun: true
          }
        }
      } catch (migrationError: any) {
        return {
          success: false,
          message: `Failed to run migrations: ${migrationError.message}`,
          migrationRun: false
        }
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
 */
export async function checkDatabaseStatus(): Promise<{
  connected: boolean;
  hasSchema: boolean;
  tables: string[];
  error?: string;
}> {
  try {
    // Try a raw query to check connection and list tables
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
