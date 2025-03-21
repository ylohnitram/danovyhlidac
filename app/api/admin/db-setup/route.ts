import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Checks if a table exists with case-insensitive comparison
 */
async function tableExists(tableName: string): Promise<boolean> {
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

/**
 * Checks if the database is properly initialized
 */
async function checkDatabaseInit() {
  try {
    const tables = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    const tableStatuses = await Promise.all(
      tables.map(async table => ({
        name: table,
        exists: await tableExists(table)
      }))
    );
    
    const allExist = tableStatuses.every(t => t.exists);
    const missingTables = tableStatuses.filter(t => !t.exists).map(t => t.name);
    
    return {
      initialized: allExist,
      tableStatuses,
      missingTables
    };
  } catch (error) {
    console.error('Error checking database initialization:', error);
    return {
      initialized: false,
      error: String(error)
    };
  }
}

/**
 * Inicializuje databázi vytvořením tabulek pomocí Prisma migrací
 */
async function setupDatabase() {
  try {
    // Check if database is already initialized
    const dbStatus = await checkDatabaseInit();
    
    if (dbStatus.initialized) {
      return { 
        success: true, 
        message: 'Databáze je již inicializována.',
        dbStatus: 'ready',
        details: dbStatus
      };
    }
    
    // If database is not initialized, create the necessary tables
    try {
      // Use lowercase table names in SQL statements as Postgres expects
      const createSmlouvaTable = await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "smlouva" (
          "id" SERIAL NOT NULL,
          "nazev" TEXT NOT NULL,
          "castka" DOUBLE PRECISION NOT NULL,
          "kategorie" TEXT NOT NULL,
          "datum" TIMESTAMP(3) NOT NULL,
          "dodavatel" TEXT NOT NULL,
          "zadavatel" TEXT NOT NULL,
          "typ_rizeni" TEXT DEFAULT 'standardní',
          "lat" DOUBLE PRECISION,
          "lng" DOUBLE PRECISION,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "smlouva_pkey" PRIMARY KEY ("id")
        )
      `;
      
      const createDodavatelTable = await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "dodavatel" (
          "nazev" TEXT NOT NULL,
          "ico" TEXT NOT NULL,
          "datum_zalozeni" TIMESTAMP(3) NOT NULL,
          "pocet_zamestnancu" INTEGER,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "dodavatel_pkey" PRIMARY KEY ("nazev")
        )
      `;
      
      const createDodavatelIcoIndex = await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "dodavatel_ico_key" ON "dodavatel"("ico")
      `;
      
      const createDodatekTable = await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "dodatek" (
          "id" SERIAL NOT NULL,
          "smlouva_id" INTEGER NOT NULL,
          "castka" DOUBLE PRECISION NOT NULL,
          "datum" TIMESTAMP(3) NOT NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "dodatek_pkey" PRIMARY KEY ("id")
        )
      `;
      
      const createPodnetTable = await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "podnet" (
          "id" SERIAL NOT NULL,
          "jmeno" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "smlouva_id" INTEGER NOT NULL,
          "zprava" TEXT NOT NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "podnet_pkey" PRIMARY KEY ("id")
        )
      `;
      
      // Create foreign keys
      const createDodatekForeignKey = await prisma.$executeRaw`
        ALTER TABLE "dodatek" ADD CONSTRAINT "dodatek_smlouva_id_fkey" 
        FOREIGN KEY ("smlouva_id") REFERENCES "smlouva"("id") 
        ON DELETE RESTRICT ON UPDATE CASCADE
      `;
      
      const createPodnetForeignKey = await prisma.$executeRaw`
        ALTER TABLE "podnet" ADD CONSTRAINT "podnet_smlouva_id_fkey" 
        FOREIGN KEY ("smlouva_id") REFERENCES "smlouva"("id") 
        ON DELETE RESTRICT ON UPDATE CASCADE
      `;
      
      // Verify that all tables were created successfully
      const verificationStatus = await checkDatabaseInit();
      
      if (verificationStatus.initialized) {
        return { 
          success: true, 
          message: 'Databáze byla úspěšně inicializována.',
          details: 'Tabulky vytvořeny manuálně pomocí SQL příkazů s malými písmeny.',
          dbStatus: 'ready',
          verificationStatus
        };
      } else {
        return {
          success: false,
          message: 'Inicializace schématu selhala při ověření. Některé tabulky nebyly vytvořeny.',
          dbStatus: 'error',
          missingTables: verificationStatus.missingTables
        };
      }
    } catch (sqlError) {
      return {
        success: false,
        message: 'Nepodařilo se vytvořit databázové schéma pomocí SQL.',
        error: sqlError instanceof Error ? sqlError.message : String(sqlError),
        dbStatus: 'error'
      };
    }
  } catch (error) {
    return {
      success: false,
      message: 'Došlo k chybě při inicializaci databáze.',
      error: error instanceof Error ? error.message : String(error),
      dbStatus: 'error'
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST() {
  // Improve message for production environment
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DB_DEBUG) {
    return NextResponse.json(
      { 
        error: 'Tento endpoint je v produkčním prostředí zakázán', 
        message: 'Z bezpečnostních důvodů je správa databáze v produkčním prostředí zakázána. Pro povolení nastavte ENABLE_DB_DEBUG=true.',
        success: false,
        isProdLocked: true
      }, 
      { status: 403 }
    );
  }

  try {
    const result = await setupDatabase();
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error setting up database:', error);
    
    return NextResponse.json({ 
      success: false, 
      message: 'Neošetřená chyba při inicializaci databáze.',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
