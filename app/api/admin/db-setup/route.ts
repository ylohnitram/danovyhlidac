import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Gets the exact name of a table (case-sensitive)
 */
async function getExactTableName(tableName: string): Promise<string | null> {
  try {
    const result = await prisma.$queryRaw`
      SELECT tablename FROM pg_tables 
      WHERE schemaname='public' 
      AND LOWER(tablename)=LOWER(${tableName})
    `;
    
    if (Array.isArray(result) && result.length > 0) {
      return result[0].tablename;
    }
    return null;
  } catch (error) {
    console.error(`Error getting exact table name for ${tableName}:`, error);
    return null;
  }
}

/**
 * Checks if the database is properly initialized
 */
async function checkDatabaseInit() {
  try {
    // Get all table names first
    const allTables = await prisma.$queryRaw`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;
    
    const tables = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    const tableStatuses = await Promise.all(
      tables.map(async table => {
        const exactName = await getExactTableName(table);
        return {
          name: table,
          exactName,
          exists: !!exactName
        };
      })
    );
    
    const allExist = tableStatuses.every(t => t.exists);
    const missingTables = tableStatuses.filter(t => !t.exists).map(t => t.name);
    
    return {
      initialized: allExist,
      tableStatuses,
      missingTables,
      allTables: allTables.map(t => t.tablename)
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
 * Drops existing tables that might have incorrect case
 */
async function dropExistingTables() {
  try {
    // Check if tables with similar names (case-insensitive) exist
    const tablesToCheck = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    
    for (const tableName of tablesToCheck) {
      const exactName = await getExactTableName(tableName);
      
      if (exactName && exactName !== tableName) {
        console.log(`Dropping table with incorrect case: ${exactName}`);
        
        // First, remove foreign key constraints
        if (exactName.toLowerCase() === 'smlouva') {
          // Check for any tables that reference this one
          const foreignKeys = await prisma.$queryRaw`
            SELECT
              tc.constraint_name, 
              tc.table_name
            FROM 
              information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu 
              ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' 
              AND ccu.table_name = ${exactName}
          `;
          
          // Drop each foreign key constraint
          if (Array.isArray(foreignKeys)) {
            for (const fk of foreignKeys) {
              await prisma.$executeRawUnsafe(`
                ALTER TABLE "${fk.table_name}" 
                DROP CONSTRAINT "${fk.constraint_name}"
              `);
            }
          }
        }
        
        // Now drop the table
        await prisma.$executeRawUnsafe(`DROP TABLE "${exactName}" CASCADE`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error dropping existing tables:', error);
    return false;
  }
}

/**
 * Inicializuje databázi vytvořením tabulek pomocí Prisma migrací
 */
async function setupDatabase() {
  try {
    // First, get the current database state
    const initialStatus = await checkDatabaseInit();
    
    if (initialStatus.initialized) {
      return { 
        success: true, 
        message: 'Databáze je již inicializována.',
        dbStatus: 'ready',
        details: initialStatus
      };
    }
    
    // Check if tables with wrong case exist and drop them
    await dropExistingTables();
    
    // Now create the necessary tables
    try {
      // Use lowercase table names in SQL statements as Postgres expects
      const createSmlouvaTable = await prisma.$executeRaw`
        CREATE TABLE "smlouva" (
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
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "smlouva_pkey" PRIMARY KEY ("id")
        )
      `;
      
      const createDodavatelTable = await prisma.$executeRaw`
        CREATE TABLE "dodavatel" (
          "nazev" TEXT NOT NULL,
          "ico" TEXT NOT NULL,
          "datum_zalozeni" TIMESTAMP(3) NOT NULL,
          "pocet_zamestnancu" INTEGER,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "dodavatel_pkey" PRIMARY KEY ("nazev")
        )
      `;
      
      const createDodavatelIcoIndex = await prisma.$executeRaw`
        CREATE UNIQUE INDEX "dodavatel_ico_key" ON "dodavatel"("ico")
      `;
      
      const createDodatekTable = await prisma.$executeRaw`
        CREATE TABLE "dodatek" (
          "id" SERIAL NOT NULL,
          "smlouva_id" INTEGER NOT NULL,
          "castka" DOUBLE PRECISION NOT NULL,
          "datum" TIMESTAMP(3) NOT NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "dodatek_pkey" PRIMARY KEY ("id")
        )
      `;
      
      const createPodnetTable = await prisma.$executeRaw`
        CREATE TABLE "podnet" (
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
      
      // Add some sample data to verify it works
      const createSampleData = await prisma.$executeRaw`
        INSERT INTO "smlouva" ("nazev", "castka", "kategorie", "datum", "dodavatel", "zadavatel", "typ_rizeni")
        VALUES ('Testovací smlouva', 1000000, 'test', CURRENT_TIMESTAMP, 'Testovací dodavatel', 'Testovací zadavatel', 'standardní')
      `;
      
      // Verify that all tables were created successfully
      const verificationStatus = await checkDatabaseInit();
      
      if (verificationStatus.initialized) {
        return { 
          success: true, 
          message: 'Databáze byla úspěšně inicializována.',
          details: 'Tabulky vytvořeny správně s přesnými názvy.',
          dbStatus: 'ready',
          verificationStatus
        };
      } else {
        return {
          success: false,
          message: 'Inicializace schématu selhala při ověření. Některé tabulky nebyly vytvořeny.',
          dbStatus: 'error',
          verificationStatus
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
