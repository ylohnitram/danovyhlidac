import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export async function GET() {
  // Disable in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DB_DEBUG) {
    return NextResponse.json({ error: 'Debug endpoint disabled in production' }, { status: 403 });
  }

  const prisma = new PrismaClient();
  try {
    // Get total counts from each table
    const smlouvaCount = await prisma.smlouva.count();
    const dodavatelCount = await prisma.dodavatel.count();
    const dodatekCount = await prisma.dodatek.count();
    const podnetCount = await prisma.podnet.count();
    
    // Get some sample data (latest entries)
    const latestSmlouvy = await prisma.smlouva.findMany({
      take: 5,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        nazev: true,
        castka: true,
        kategorie: true,
        datum: true,
        created_at: true
      }
    });
    
    // Get database tables
    const tables = await prisma.$queryRaw<{tablename: string}[]>`
      SELECT tablename FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
    `;
    
    return NextResponse.json({ 
      status: 'success', 
      counts: {
        smlouva: smlouvaCount,
        dodavatel: dodavatelCount,
        dodatek: dodatekCount,
        podnet: podnetCount,
        total: smlouvaCount + dodavatelCount + dodatekCount + podnetCount
      },
      tables: tables.map(t => t.tablename),
      latestSmlouvy,
      timestamp: new Date().toISOString()
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
