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

// Function to check if the database is initialized
export async function isDatabaseInitialized(): Promise<boolean> {
  try {
    // Try a simple query to check if the table exists
    await prisma!.smlouva.findFirst({
      select: { id: true },
      take: 1
    });
    return true;
  } catch (error) {
    // Check if it's a "table does not exist" error
    if (
      error instanceof Prisma.PrismaClientKnownRequestError && 
      (error.code === 'P2010' || error.message.includes('does not exist'))
    ) {
      return false;
    }
    
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
}> {
  try {
    // First check if we can connect to the database at all
    await prisma!.$connect();
    
    // Then check if the tables exist
    try {
      await prisma!.smlouva.findFirst({ select: { id: true }, take: 1 });
      
      return {
        initialized: true,
        connected: true,
        message: "Database is fully initialized"
      };
    } catch (tableError) {
      if (
        tableError instanceof Prisma.PrismaClientKnownRequestError && 
        (tableError.code === 'P2010' || tableError.message.includes('does not exist'))
      ) {
        return {
          initialized: false,
          connected: true,
          error: tableError.message,
          message: "Database is connected, but tables are not created. Please run migrations."
        };
      }
      
      throw tableError; // Re-throw unexpected errors
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
