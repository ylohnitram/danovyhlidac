import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

/**
 * Checks if a table exists with case-insensitive comparison
 */
async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw`
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
    // Check if all required tables exist (case-insensitive)
    const requiredTables = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    const tableStatuses = await Promise.all(
      requiredTables.map(async table => ({
        name: table,
        exists: await tableExists(prisma, table)
      }))
    );
    
    const missingTables = tableStatuses.filter(t => !t.exists).map(t => t.name);
    const allTablesExist = missingTables.length === 0;
    
    if (!allTablesExist) {
      return NextResponse.json({ 
        status: 'error', 
        message: `Některé tabulky chybí: ${missingTables.join(', ')}`,
        connected: true,
        hasSchema: false,
        tables: tableStatuses,
        tableInfo: `Tabulky jsou v PostgreSQL case-sensitive. Očekávají se tabulky s malými písmeny: ${requiredTables.join(', ')}`,
        timestamp: new Date().toISOString()
      });
    }
    
    // If all tables exist, get counts
    try {
      // Get total counts from each table using lowercase table names
      const smlouvaCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "smlouva"`;
      const dodavatelCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "dodavatel"`;
      const dodatekCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "dodatek"`;
      const podnetCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "podnet"`;
      
      // Get some sample data (latest entries)
      const latestSmlouvy = await prisma.$queryRaw`
        SELECT 
          id, 
          nazev, 
          castka, 
          kategorie, 
          datum, 
          created_at 
        FROM "smlouva" 
        ORDER BY created_at DESC 
        LIMIT 5
      `;
      
      // Get all database tables with case-insensitive search
      const tables = await prisma.$queryRaw<{tablename: string}[]>`
        SELECT tablename FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
      `;
      
      return NextResponse.json({ 
        status: 'success', 
        counts: {
          smlouva: Array.isArray(smlouvaCount) && smlouvaCount.length > 0 ? Number(smlouvaCount[0].count) : 0,
          dodavatel: Array.isArray(dodavatelCount) && dodavatelCount.length > 0 ? Number(dodavatelCount[0].count) : 0,
          dodatek: Array.isArray(dodatekCount) && dodatekCount.length > 0 ? Number(dodatekCount[0].count) : 0,
          podnet: Array.isArray(podnetCount) && podnetCount.length > 0 ? Number(podnetCount[0].count) : 0,
          total: (
            (Array.isArray(smlouvaCount) && smlouvaCount.length > 0 ? Number(smlouvaCount[0].count) : 0) +
            (Array.isArray(dodavatelCount) && dodavatelCount.length > 0 ? Number(dodavatelCount[0].count) : 0) +
            (Array.isArray(dodatekCount) && dodatekCount.length > 0 ? Number(dodatekCount[0].count) : 0) +
            (Array.isArray(podnetCount) && podnetCount.length > 0 ? Number(podnetCount[0].count) : 0)
          )
        },
        tableStatuses,
        tables: tables.map(t => t.tablename),
        latestSmlouvy,
        timestamp: new Date().toISOString()
      });
    } catch (countError) {
      return NextResponse.json({ 
        status: 'error', 
        message: `Tabulky existují, ale došlo k chybě při počítání záznamů: ${countError instanceof Error ? countError.message : String(countError)}`,
        connected: true,
        hasSchema: true,
        tableStatuses,
        error: countError instanceof Error ? countError.message : String(countError),
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    return NextResponse.json({ 
      status: 'error', 
      message: error.message,
      connected: false,
      hasSchema: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
