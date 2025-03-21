// This file provides utilities to check database initialization state
// and helps with error handling when database tables don't exist yet

import { PrismaClient, Prisma } from '@prisma/client';

// Singleton for PrismaClient to avoid multiple instances
let prisma: PrismaClient | undefined;

if (process.env.NODE_ENV !== 'production') {
  prisma = new PrismaClient();
} else {
  // In production, use global singleton
  if (!(global as any).prisma) {
    (global as any).prisma = new PrismaClient();
  }
  prisma = (global as any).prisma;
}

// Function to check if a table exists (case-insensitive)
async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    // Use a raw SQL query to check table existence case-insensitively
    const result = await prisma!.$queryRaw`
      SELECT 1 FROM pg_tables 
      WHERE schemaname='public' 
      AND LOWER(tablename)=LOWER(${tableName})
    `;
    
    return Array.isArray(result) && result.length > 0;
  } catch (error) {
    console.error(`Error checking table existence for ${tableName}:`, error);
    return false;
  }
}

// Function to check if the database is initialized
export async function isDatabaseInitialized(): Promise<boolean> {
  try {
    // Check if all required tables exist with case-insensitive comparison
    const smlouvaExists = await checkTableExists('smlouva');
    const dodavatelExists = await checkTableExists('dodavatel');
    const dodatekExists = await checkTableExists('dodatek');
    const podnetExists = await checkTableExists('podnet');
    
    // Database is initialized if all tables exist
    return smlouvaExists && dodavatelExists && dodatekExists && podnetExists;
  } catch (error) {
    // For other errors, just log and return false
    console.error('Error checking database initialization:', error);
    return false;
  }
}

// Function to check database status with more details
export async function getDatabaseStatus(): Promise<{
  initialized: boolean;
  connected: boolean;
  error?: string;
  message?: string;
  tables?: { name: string; exists: boolean }[];
}> {
  try {
    // First check if we can connect to the database at all
    await prisma!.$connect();
    
    // Then check the existence of each table
    const tables = [
      { name: 'smlouva', exists: await checkTableExists('smlouva') },
      { name: 'dodavatel', exists: await checkTableExists('dodavatel') },
      { name: 'dodatek', exists: await checkTableExists('dodatek') },
      { name: 'podnet', exists: await checkTableExists('podnet') }
    ];
    
    const allExist = tables.every(t => t.exists);
    
    if (allExist) {
      return {
        initialized: true,
        connected: true,
        message: "Database is fully initialized",
        tables
      };
    } else {
      const missingTables = tables.filter(t => !t.exists).map(t => t.name).join(', ');
      return {
        initialized: false,
        connected: true,
        message: `Database is connected, but some tables are missing: ${missingTables}. Please run migrations.`,
        tables
      };
    }
  } catch (error) {
    // Handle connection errors
    return {
      initialized: false,
      connected: false,
      error: error instanceof Error ? error.message : String(error),
      message: "Could not connect to the database"
    };
  }
}

export { prisma };
