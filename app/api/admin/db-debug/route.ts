import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export async function GET() {
  // Improve message for production environment
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DB_DEBUG) {
    return NextResponse.json({ 
      error: 'Debug endpoint disabled in production', 
      status: 'forbidden',
      message: 'Tento endpoint je v produkčním prostředí zakázán z bezpečnostních důvodů. Pro povolení nastavte ENABLE_DB_DEBUG=true.',
      isProdLocked: true
    }, { status: 403 });
  }

  const prisma = new PrismaClient();
  try {
    // Get all tables in the database with their exact names
    const allTables = await prisma.$queryRaw`
      SELECT 
        tablename,
        schemaname
      FROM 
        pg_catalog.pg_tables
      WHERE 
        schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY 
        schemaname, tablename
    `;
    
    // Check if certain tables (case-insensitive) exist
    const requiredTables = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    const tableChecks = await Promise.all(
      requiredTables.map(async table => {
        // Check with case-insensitive comparison
        const exists = await prisma.$queryRaw`
          SELECT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE schemaname='public' 
            AND LOWER(tablename)=LOWER(${table})
          ) as exists
        `;
        
        // If it exists, get the exact name
        let exactName = null;
        if (exists[0].exists) {
          const exactNameQuery = await prisma.$queryRaw`
            SELECT tablename FROM pg_tables 
            WHERE schemaname='public' 
            AND LOWER(tablename)=LOWER(${table})
          `;
          exactName = exactNameQuery[0]?.tablename;
        }
        
        return {
          requiredName: table,
          exists: exists[0].exists,
          exactName
        };
      })
    );
    
    // Try to count rows in each found table
    const tableCounts = [];
    for (const table of tableChecks) {
      if (table.exists && table.exactName) {
        try {
          // Use the exact name of the table for counting
          const countQuery = `SELECT COUNT(*) as count FROM "${table.exactName}"`;
          const count = await prisma.$queryRawUnsafe(countQuery);
          
          tableCounts.push({
            table: table.exactName,
            count: count[0]?.count || 0,
            error: null
          });
        } catch (countError) {
          tableCounts.push({
            table: table.exactName,
            count: null,
            error: countError instanceof Error ? countError.message : String(countError)
          });
        }
      }
    }

    return NextResponse.json({ 
      status: 'success', 
      allTables,
      tableChecks,
      tableCounts,
      metadata: {
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json({ 
      status: 'error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
