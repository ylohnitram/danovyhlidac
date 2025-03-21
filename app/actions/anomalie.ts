"use server"

import { getCachedStats, cacheStats } from "@/lib/cache"
import { prisma } from "@/lib/db-init"

// Typy anomálií, které detekujeme
const ANOMALY_TYPES = {
  NEW_COMPANY_BIG_CONTRACT: "nová firma",
  NO_TENDER: "bez výběrového řízení",
  PRICE_INCREASE: "navýšení ceny",
  SINGLE_EMPLOYEE: "malá firma",
  BIG_AMOUNT: "velká částka"
};

// Funkce pro získání přesného názvu tabulky (case-sensitive)
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
    console.error(`Chyba při zjišťování přesného názvu tabulky ${tableName}:`, error);
    return null;
  }
}

// Funkce pro ověření, zda je databáze správně inicializována
async function isDatabaseInitialized(): Promise<{
  ready: boolean;
  tableMap?: Record<string, string | null>;
  errorDetails?: string;
}> {
  try {
    // Zjistíme přesné názvy tabulek
    const tables = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    const tableInfo = await Promise.all(
      tables.map(async tableName => {
        const exactName = await getExactTableName(tableName);
        return { tableName, exactName };
      })
    );
    
    const tableMap = Object.fromEntries(
      tableInfo.map(t => [t.tableName, t.exactName])
    );
    
    // Pokud některá tabulka neexistuje, vrátíme false
    const missingTables = tableInfo.filter(t => !t.exactName).map(t => t.tableName);
    if (missingTables.length > 0) {
      return { 
        ready: false, 
        tableMap,
        errorDetails: `Chybějící tabulky: ${missingTables.join(', ')}`
      };
    }
    
    // Zkontrolujeme, zda můžeme přistupovat k datům v tabulkách
    try {
      // Zkusíme jednoduchý dotaz na počet záznamů v tabulce smlouva
      const countQuery = `SELECT COUNT(*) as count FROM "${tableMap.smlouva}"`;
      await prisma.$queryRawUnsafe(countQuery);
      
      return { ready: true, tableMap };
    } catch (queryError) {
      return { 
        ready: false, 
        tableMap,
        errorDetails: `Chyba při přístupu k datům: ${queryError instanceof Error ? queryError.message : String(queryError)}`
      };
    }
  } catch (error) {
    console.error('Chyba při kontrole inicializace databáze:', error);
    return { 
      ready: false,
      errorDetails: `Neočekávaná chyba: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export async function getNeobvykleSmlouvy(limit = 5) {
  try {
    // Zkusit načíst z cache
    const cachedData = await getCachedStats("neobvykleSmlouvy");
    if (cachedData) {
      return { data: cachedData, cached: true };
    }

    // Check if database is initialized
    const dbStatus = await isDatabaseInitialized();
    
    if (!dbStatus.ready) {
      console.warn("Databáze není plně inicializovaná");
      return { 
        data: [], 
        cached: false,
        dbStatus: {
          ready: false,
          message: `Databázové tabulky nejsou správně nastaveny. ${dbStatus.errorDetails || "Je potřeba spustit inicializaci databáze."}`
        } 
      };
    }

    // Máme správné názvy tabulek
    const tableMap = dbStatus.tableMap!;

    try {
      // Použijeme $queryRawUnsafe s přesnými názvy tabulek
      
      // 1. Nová firma s velkou zakázkou
      const newCompanyQuery = `
        SELECT 
          s.id,
          s.nazev as title,
          s.castka as amount,
          s.datum as date,
          s.dodavatel as contractor,
          s.zadavatel as authority,
          'IT služby' as category,
          ARRAY['nová firma', 'malá firma', 'velká částka']::text[] as flags,
          'Společnost založená před méně než 6 měsíci získala zakázku nad 10M Kč.' as description
        FROM "${tableMap.smlouva}" s
        JOIN "${tableMap.dodavatel}" d ON s.dodavatel = d.nazev
        WHERE d.datum_zalozeni > NOW() - INTERVAL '6 months'
        AND s.castka > 10000000
        LIMIT 5
      `;
      const newCompanyBigContracts = await prisma.$queryRawUnsafe(newCompanyQuery);

      // 2. Zakázky bez výběrového řízení
      const noTenderQuery = `
        SELECT 
          s.id,
          s.nazev as title,
          s.castka as amount,
          s.datum as date,
          s.dodavatel as contractor,
          s.zadavatel as authority,
          'Stavební práce' as category,
          ARRAY['bez výběrového řízení', 'časová tíseň']::text[] as flags,
          'Zakázka zadána bez řádného výběrového řízení s odvoláním na výjimku.' as description
        FROM "${tableMap.smlouva}" s
        WHERE s.typ_rizeni = 'bez výběrového řízení'
        AND s.castka > 5000000
        LIMIT 5
      `;
      const noTenderContracts = await prisma.$queryRawUnsafe(noTenderQuery);

      // 3. Dodatky navyšující cenu
      const priceIncreaseQuery = `
        SELECT 
          s.id,
          s.nazev as title,
          s.castka as amount,
          s.datum as date,
          s.dodavatel as contractor,
          s.zadavatel as authority,
          'Stavební práce' as category,
          ARRAY['dodatky', 'navýšení ceny']::text[] as flags,
          'Původní zakázka byla výrazně navýšena dodatky.' as description
        FROM "${tableMap.smlouva}" s
        WHERE EXISTS (
          SELECT 1 FROM "${tableMap.dodatek}" d 
          WHERE d.smlouva_id = s.id 
          GROUP BY d.smlouva_id
          HAVING SUM(d.castka) > s.castka * 0.3
        )
        LIMIT 5
      `;
      const priceIncreaseContracts = await prisma.$queryRawUnsafe(priceIncreaseQuery);

      // Spojení všech anomálií
      let allAnomalies = [
        ...newCompanyBigContracts,
        ...noTenderContracts,
        ...priceIncreaseContracts
      ];
      
      // Pokud nemáme žádné anomálie, vrátíme prázdné pole
      if (allAnomalies.length === 0) {
        return { 
          data: [], 
          cached: false,
          dbStatus: {
            ready: true,
            message: "Databáze je připravena, ale nebyla nalezena žádná data odpovídající kritériím pro neobvyklé zakázky."
          }
        };
      }
      
      // Seřadit podle data a omezit počet
      const finalResults = allAnomalies
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit);
      
      // Uložit do cache
      await cacheStats("neobvykleSmlouvy", finalResults);
      
      return { 
        data: finalResults, 
        cached: false,
        dbStatus: {
          ready: true
        } 
      };
    } catch (dbError) {
      console.error("Chyba při dotazování do databáze:", dbError);
      return { 
        data: [], 
        cached: false,
        error: dbError instanceof Error ? dbError.message : String(dbError),
        dbStatus: {
          ready: false,
          message: "Došlo k chybě při dotazování do databáze: " + 
            (dbError instanceof Error ? dbError.message : String(dbError))
        }
      };
    }
  } catch (error) {
    console.error("Chyba při načítání neobvyklých zakázek:", error);
    return { 
      data: [], 
      cached: false,
      error: (error as Error).message,
      dbStatus: {
        ready: false,
        message: "Neočekávaná chyba při načítání dat: " + (error as Error).message
      }
    };
  }
}
