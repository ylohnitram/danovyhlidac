"use server"

import prisma from "@/lib/db"
import { getCachedStats, cacheStats } from "@/lib/cache"

// Typy anomálií, které detekujeme
const ANOMALY_TYPES = {
  NEW_COMPANY_BIG_CONTRACT: "nová firma",
  NO_TENDER: "bez výběrového řízení",
  PRICE_INCREASE: "navýšení ceny",
  SINGLE_EMPLOYEE: "malá firma",
  BIG_AMOUNT: "velká částka"
};

export async function getNeobvykleSmlouvy(limit = 5) {
  try {
    // Zkusit načíst z cache
    const cachedData = await getCachedStats("neobvykleSmlouvy");
    if (cachedData) {
      return { data: cachedData, cached: true };
    }

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
  } catch (error) {
    console.error("Chyba při načítání neobvyklých zakázek:", error);
    throw new Error("Nepodařilo se načíst data o neobvyklých zakázkách");
  }
}
