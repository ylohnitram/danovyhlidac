"use server"

import { PrismaClient } from '@prisma/client'
import { getCachedStats, cacheStats } from "@/lib/cache"

// Server-side only PrismaClient instance
const prisma = new PrismaClient()

// Typy anomálií, které detekujeme
const ANOMALY_TYPES = {
  NEW_COMPANY_BIG_CONTRACT: "nová firma",
  NO_TENDER: "bez výběrového řízení",
  PRICE_INCREASE: "navýšení ceny",
  SINGLE_EMPLOYEE: "malá firma",
  BIG_AMOUNT: "velká částka"
};

// Funkce pro získání mock dat, když databáze není připravena
function getMockAnomalies() {
  return [
    {
      id: 1001,
      title: "Rekonstrukce silnice I/35",
      amount: 125000000,
      date: new Date().toISOString(),
      contractor: "Nová Firma s.r.o.",
      authority: "ŘSD",
      category: "silnice",
      flags: ["nová firma", "velká částka"],
      description: "Společnost založená před méně než 6 měsíci získala zakázku nad 100M Kč."
    },
    {
      id: 1002,
      title: "Dodávka IT systému pro ministerstvo",
      amount: 75000000,
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      contractor: "Tech Solutions s.r.o.",
      authority: "Ministerstvo financí",
      category: "IT služby",
      flags: ["bez výběrového řízení", "časová tíseň"],
      description: "Zakázka zadána bez řádného výběrového řízení s odvoláním na výjimku."
    },
    {
      id: 1003,
      title: "Výstavba sportovní haly",
      amount: 45000000,
      date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      contractor: "StavbyPlus a.s.",
      authority: "Město Brno",
      category: "stavebnictví",
      flags: ["dodatky", "navýšení ceny"],
      description: "Původní zakázka byla výrazně navýšena dodatky."
    }
  ];
}

export async function getNeobvykleSmlouvy(limit = 5) {
  try {
    // Zkusit načíst z cache
    const cachedData = await getCachedStats("neobvykleSmlouvy");
    if (cachedData) {
      return { data: cachedData, cached: true };
    }

    // Check if tables exist by running a simple query
    try {
      // This will throw an error if the table doesn't exist
      await prisma.smlouva.findFirst();
    } catch (schemaError) {
      console.warn("Databázové tabulky ještě nejsou vytvořeny:", schemaError);
      
      // If we're in development mode, we'll provide some sample data
      if (process.env.NODE_ENV === 'development') {
        const mockData = getMockAnomalies();
        return { data: mockData, cached: false, mock: true };
      }
      
      // Return empty data in production rather than crashing
      return { data: [], cached: false, dbNotReady: true };
    }

    // V produkčním prostředí bez databáze vracíme alespoň mock data
    try {
      // 1. Nová firma s velkou zakázkou
      const newCompanyBigContracts = await prisma.$queryRaw`
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
        FROM smlouva s
        JOIN dodavatel d ON s.dodavatel = d.nazev
        WHERE d.datum_zalozeni > NOW() - INTERVAL '6 months'
        AND s.castka > 10000000
        LIMIT 5
      `;

      // 2. Zakázky bez výběrového řízení
      const noTenderContracts = await prisma.$queryRaw`
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
        FROM smlouva s
        WHERE s.typ_rizeni = 'bez výběrového řízení'
        AND s.castka > 5000000
        LIMIT 5
      `;

      // 3. Dodatky navyšující cenu
      const priceIncreaseContracts = await prisma.$queryRaw`
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
        FROM smlouva s
        WHERE EXISTS (
          SELECT 1 FROM dodatek d 
          WHERE d.smlouva_id = s.id 
          GROUP BY d.smlouva_id
          HAVING SUM(d.castka) > s.castka * 0.3
        )
        LIMIT 5
      `;

      // Spojit všechny výsledky a omezit počet
      const allAnomalies = [
        ...newCompanyBigContracts,
        ...noTenderContracts,
        ...priceIncreaseContracts
      ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
      
      // Uložit do cache
      await cacheStats("neobvykleSmlouvy", allAnomalies);
      
      return { data: allAnomalies, cached: false };
    } catch (dbError) {
      // Pokud nastane chyba při dotazech, vracíme mock data
      console.error("Chyba při dotazování do databáze:", dbError);
      const mockData = getMockAnomalies();
      return { data: mockData, cached: false, mock: true, error: dbError.message };
    }
  } catch (error) {
    console.error("Chyba při načítání neobvyklých zakázek:", error);
    // V případě jakékoli chyby vracíme mock data jako fallback
    const mockData = getMockAnomalies();
    return { data: mockData, cached: false, mock: true, error: (error as Error).message };
  }
}
