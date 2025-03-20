/**
 * Client-safe database status checking
 * Contains only API calls to server actions, no direct Prisma usage
 */

import { checkDatabaseStatus as serverCheckStatus } from '@/app/actions/db-actions'

/**
 * Checks if the database is properly set up by calling a server action
 */
export async function checkDatabaseSetup(): Promise<{ 
  success: boolean; 
  message: string;
  migrationRun: boolean;
}> {
  try {
    // Call the server action to check status
    const status = await serverCheckStatus()
    
    return {
      success: status.connected && status.hasSchema,
      message: status.error || (status.connected ? 
        (status.hasSchema ? "Database schema is properly set up" : "Database is connected but schema is missing") : 
        "Database connection failed"),
      migrationRun: false
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Database check error: ${error.message}`,
      migrationRun: false
    }
  }
}
