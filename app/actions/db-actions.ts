"use server"

import { PrismaClient } from '@prisma/client'

// This file only runs on the server side due to the "use server" directive
const prisma = new PrismaClient()

/**
 * Server action to check database connection and schema status
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
