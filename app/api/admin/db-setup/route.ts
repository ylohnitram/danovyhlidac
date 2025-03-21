import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Inicializuje databázi vytvořením tabulek pomocí Prisma migrací
 */
async function setupDatabase() {
  try {
    // Zkusíme, jestli už databáze nemá schema
    try {
      await prisma.smlouva.count();
      return { 
        success: true, 
        message: 'Databáze je již inicializována.',
        dbStatus: 'ready'
      };
    } catch (error: any) {
      // Pokud nastala chyba, že tabulka neexistuje, pokračujeme s migracemi
      if (error.message?.includes('does not exist') || 
          error.code === 'P2010' ||
          error.meta?.details?.includes('does not exist')) {
        
        // V produkčním prostředí nemůžeme přímo spouštět příkazy
        // Místo toho musíme použít API Prisma Clientu
        
        try {
          // Nejprve zkusíme najít existující migrace
          const migrations = await prisma.$queryRaw`
            SELECT * FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations'
          `;
          
          // Pokud nemáme migrační tabulku, můžeme se pokusit vygenerovat schema přímo
          // POZNÁMKA: Tohle je nouzové řešení a mělo by se používat opatrně
          // Ideálně by se měly spouštět migrace pomocí Prisma CLI
          
          const createSmlouvaTable = await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "Smlouva" (
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
              CONSTRAINT "Smlouva_pkey" PRIMARY KEY ("id")
            )
          `;
          
          const createDodavatelTable = await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "Dodavatel" (
              "nazev" TEXT NOT NULL,
              "ico" TEXT NOT NULL,
              "datum_zalozeni" TIMESTAMP(3) NOT NULL,
              "pocet_zamestnancu" INTEGER,
              "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updated_at" TIMESTAMP(3) NOT NULL,
              CONSTRAINT "Dodavatel_pkey" PRIMARY KEY ("nazev")
            )
          `;
          
          const createDodavatelIcoIndex = await prisma.$executeRaw`
            CREATE UNIQUE INDEX IF NOT EXISTS "Dodavatel_ico_key" ON "Dodavatel"("ico")
          `;
          
          const createDodatekTable = await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "Dodatek" (
              "id" SERIAL NOT NULL,
              "smlouva_id" INTEGER NOT NULL,
              "castka" DOUBLE PRECISION NOT NULL,
              "datum" TIMESTAMP(3) NOT NULL,
              "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "Dodatek_pkey" PRIMARY KEY ("id")
            )
          `;
          
          const createPodnetTable = await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "Podnet" (
              "id" SERIAL NOT NULL,
              "jmeno" TEXT NOT NULL,
              "email" TEXT NOT NULL,
              "smlouva_id" INTEGER NOT NULL,
              "zprava" TEXT NOT NULL,
              "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "Podnet_pkey" PRIMARY KEY ("id")
            )
          `;
          
          // Vytvoření cizích klíčů
          const createDodatekForeignKey = await prisma.$executeRaw`
            ALTER TABLE "Dodatek" ADD CONSTRAINT "Dodatek_smlouva_id_fkey" 
            FOREIGN KEY ("smlouva_id") REFERENCES "Smlouva"("id") 
            ON DELETE RESTRICT ON UPDATE CASCADE
          `;
          
          const createPodnetForeignKey = await prisma.$executeRaw`
            ALTER TABLE "Podnet" ADD CONSTRAINT "Podnet_smlouva_id_fkey" 
            FOREIGN KEY ("smlouva_id") REFERENCES "Smlouva"("id") 
            ON DELETE RESTRICT ON UPDATE CASCADE
          `;
          
          // Kontrola, zda je schema vytvořeno
          try {
            const count = await prisma.smlouva.count();
            return { 
              success: true, 
              message: 'Databáze byla úspěšně inicializována.',
              details: 'Tabulky vytvořeny manuálně pomocí SQL příkazů.',
              dbStatus: 'ready'
            };
          } catch (verifyError) {
            return {
              success: false,
              message: 'Inicializace schématu selhala při ověření.',
              error: verifyError instanceof Error ? verifyError.message : String(verifyError),
              dbStatus: 'error' 
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
      } else {
        throw error; // Jiná chyba než neexistující tabulka
      }
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
