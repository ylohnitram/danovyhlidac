"use server"

import { prisma } from "@/lib/db-init"
import { getCachedStats, cacheStats } from "@/lib/cache"

// Definice typů entit
export type EntityType = "city" | "institution" | "company" | "other" | "uncategorized";

// Základní data měst
const CITY_BASE_DATA = [
  { id: "praha", name: "Praha", population: 1309000, entityType: "city" as EntityType },
  { id: "brno", name: "Brno", population: 382000, entityType: "city" as EntityType },
  { id: "ostrava", name: "Ostrava", population: 287000, entityType: "city" as EntityType },
  { id: "plzen", name: "Plzeň", population: 174000, entityType: "city" as EntityType },
  { id: "liberec", name: "Liberec", population: 104000, entityType: "city" as EntityType },
  { id: "olomouc", name: "Olomouc", population: 100000, entityType: "city" as EntityType },
  { id: "ceske-budejovice", name: "České Budějovice", population: 94000, entityType: "city" as EntityType },
  { id: "hradec-kralove", name: "Hradec Králové", population: 92000, entityType: "city" as EntityType },
  { id: "usti-nad-labem", name: "Ústí nad Labem", population: 92000, entityType: "city" as EntityType },
  { id: "pardubice", name: "Pardubice", population: 91000, entityType: "city" as EntityType },
  { id: "zlin", name: "Zlín", population: 75000, entityType: "city" as EntityType },
  { id: "havirov", name: "Havířov", population: 71000, entityType: "city" as EntityType },
  { id: "kladno", name: "Kladno", population: 69000, entityType: "city" as EntityType },
  { id: "most", name: "Most", population: 66000, entityType: "city" as EntityType },
  { id: "opava", name: "Opava", population: 56000, entityType: "city" as EntityType },
  { id: "frydek-mistek", name: "Frýdek-Místek", population: 55000, entityType: "city" as EntityType },
  { id: "karvina", name: "Karviná", population: 52000, entityType: "city" as EntityType },
  { id: "jihlava", name: "Jihlava", population: 51000, entityType: "city" as EntityType },
  { id: "teplice", name: "Teplice", population: 50000, entityType: "city" as EntityType },
  { id: "decin", name: "Děčín", population: 49000, entityType: "city" as EntityType },
];

// Speciální entita pro nezařazené položky
const UNCATEGORIZED_ENTITY = {
  id: "nezarazeno",
  name: "Nezařazeno",
  population: 0,
  entityType: "uncategorized" as EntityType
};

// Typ pro statistiky měst
export type EntityStats = {
  id: string;
  name: string;
  population: number;
  contractsCount: number;
  totalValue: number;
  entityType: EntityType;
};

/**
 * Zjistí, zda se jedná o město ze seznamu
 */
function isCityFromList(cityName: string): boolean {
  const normalizedName = normalizeCityName(cityName);
  
  return CITY_BASE_DATA.some(city => 
    normalizeCityName(city.name) === normalizedName
  );
}

/**
 * Normalizuje a extrahuje jméno města z textu
 */
function extractCityFromText(text: string): string | null {
  if (!text) return null;
  
  // Normalize for matching
  const normalizedText = text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove diacritics
  
  // Try to match any of our predefined cities in the text
  for (const city of CITY_BASE_DATA) {
    const normalizedCityName = normalizeCityName(city.name);
    
    // Check if the normalized city name appears in the text
    if (normalizedText.includes(normalizedCityName)) {
      return city.name; // Return the proper city name
    }
  }
  
  return null;
}

/**
 * Normalizuje a extrahuje jméno města z české adresy
 */
function extractCityFromAddress(address: string | null): string | null {
  return extractCityFromText(address);
}

/**
 * Normalizuje a extrahuje jméno města ze jména zadavatele
 */
function extractCityFromContractingAuthority(authority: string | null): string | null {
  return extractCityFromText(authority);
}

/**
 * Normalizuje jméno města do standardní podoby
 */
function normalizeCityName(city: string): string {
  if (!city) return '';
  
  // Basic normalization
  let normalized = city.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .trim();
  
  // Remove any " - " with suffixes (like "Frýdek-Místek - Frýdek")
  normalized = normalized.replace(/\s+-\s+.*$/, '');
  
  // Keep only the first part of "Praha X" or similar
  if (normalized.startsWith('praha ')) {
    normalized = 'praha';
  }
  
  return normalized;
}

/**
 * Získá základní data o městě podle jména
 */
function getBaseCityData(cityName: string): (typeof CITY_BASE_DATA)[0] | null {
  if (!cityName) return null;
  
  // Exact match by name (case-insensitive)
  const normalizedName = normalizeCityName(cityName);
  
  // Find exact match
  const exactMatch = CITY_BASE_DATA.find(city => 
    normalizeCityName(city.name) === normalizedName
  );
  
  if (exactMatch) return exactMatch;
  
  // Find partial match
  const partialMatch = CITY_BASE_DATA.find(city => 
    normalizedName.includes(normalizeCityName(city.name)) ||
    normalizeCityName(city.name).includes(normalizedName)
  );
  
  return partialMatch || null;
}

/**
 * Načte statistiky měst a rozdělí zakázky do příslušných měst nebo do kategorie "Nezařazeno"
 */
export async function fetchActualCityStats(): Promise<EntityStats[]> {
  try {
    // Try to get from cache first
    const cachedData = await getCachedStats("cityStatsByAddress");
    if (cachedData) {
      return cachedData;
    }

    // Get exact table name
    const tableInfo = await prisma.$queryRaw`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname='public' 
      AND LOWER(tablename)=LOWER('smlouva')
    `;
    
    const smlouvaTable = Array.isArray(tableInfo) && tableInfo.length > 0 
      ? tableInfo[0].tablename 
      : 'smlouva';

    // Check if the database/table is available
    const isDatabaseAvailable = await checkDatabaseAvailability(smlouvaTable);
    
    if (!isDatabaseAvailable) {
      // If database isn't ready, return base data with zero counts
      const fallbackData = CITY_BASE_DATA.map(city => ({
        ...city,
        contractsCount: 0,
        totalValue: 0
      }));
      
      // Cache this data briefly (5 minutes)
      await cacheStats("cityStatsByAddress", fallbackData, 300);
      
      return fallbackData;
    }

    // Initialize city stats map with base cities (all have 0 contracts by default)
    const cityStatsMap = new Map<string, EntityStats>();
    
    // Add base cities to the map
    for (const baseCity of CITY_BASE_DATA) {
      cityStatsMap.set(baseCity.id, {
        ...baseCity,
        contractsCount: 0,
        totalValue: 0
      });
    }
    
    // Also initialize the "Nezařazeno" category
    const uncategorizedStats: EntityStats = {
      ...UNCATEGORIZED_ENTITY,
      contractsCount: 0,
      totalValue: 0
    };

    // Check if zadavatel_adresa column exists
    const hasAddressCol = await checkColumnExists(smlouvaTable, 'zadavatel_adresa');
    
    // Get all contracts grouped by zadavatel and/or zadavatel_adresa
    const contractGroups = await prisma.$queryRawUnsafe(`
      SELECT 
        zadavatel,
        ${hasAddressCol ? 'zadavatel_adresa,' : ''}
        COUNT(*) as contract_count, 
        SUM(castka) as total_value
      FROM "${smlouvaTable}"
      WHERE zadavatel IS NOT NULL AND zadavatel != ''
      GROUP BY zadavatel${hasAddressCol ? ', zadavatel_adresa' : ''}
    `);
    
    // Process all contract groups
    if (Array.isArray(contractGroups)) {
      for (const item of contractGroups) {
        const contractCount = parseInt(item.contract_count || '0');
        const totalValue = parseFloat(item.total_value || '0');
        
        // Skip if no valid data
        if (contractCount <= 0) continue;
        
        // Try to extract city from address or authority name
        let cityName = null;
        if (hasAddressCol && item.zadavatel_adresa) {
          cityName = extractCityFromAddress(item.zadavatel_adresa);
        }
        
        // If no city found from address, try from authority name
        if (!cityName && item.zadavatel) {
          cityName = extractCityFromContractingAuthority(item.zadavatel);
        }
        
        if (cityName) {
          // Get base city data
          const baseCity = getBaseCityData(cityName);
          
          if (baseCity) {
            // Update city stats
            const cityId = baseCity.id;
            if (cityStatsMap.has(cityId)) {
              const existingStats = cityStatsMap.get(cityId)!;
              cityStatsMap.set(cityId, {
                ...existingStats,
                contractsCount: existingStats.contractsCount + contractCount,
                totalValue: existingStats.totalValue + totalValue
              });
            }
            continue; // Processed as a known city
          }
        }
        
        // If we get here, add to the "Nezařazeno" category
        uncategorizedStats.contractsCount += contractCount;
        uncategorizedStats.totalValue += totalValue;
      }
    }
    
    // Add "Nezařazeno" to the map if it has any contracts
    if (uncategorizedStats.contractsCount > 0) {
      cityStatsMap.set(uncategorizedStats.id, uncategorizedStats);
    }
    
    // Convert map to array and sort by contract count (descending)
    const cityStats = Array.from(cityStatsMap.values())
      .filter(city => city.contractsCount > 0) // Only include cities with contracts
      .sort((a, b) => b.contractsCount - a.contractsCount);
    
    // Cache the results
    await cacheStats("cityStatsByAddress", cityStats);
    
    return cityStats;
  } catch (error) {
    console.error("Error fetching city stats by address:", error);
    
    // Return base data with zero counts in case of error
    const fallbackData = CITY_BASE_DATA.map(city => ({
      ...city,
      contractsCount: 0,
      totalValue: 0
    }));
    
    return fallbackData;
  }
}

/**
 * Fetches all entities stats (legacy function for backward compatibility)
 */
export async function fetchCityStats(): Promise<EntityStats[]> {
  // Now just calling the actual city stats function
  return fetchActualCityStats();
}

/**
 * Fetch details for a specific entity
 */
export async function fetchEntityDetail(entityId: string) {
  try {
    // Try to get from cache first
    const cacheKey = `entityDetail:${entityId}`;
    const cachedData = await getCachedStats(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }
    
    // Get all city data
    const allCities = await fetchActualCityStats();
    
    // Find the specific entity (city or uncategorized)
    const entity = allCities.find(c => c.id === entityId);
    
    if (!entity) {
      return null;
    }
    
    // Get exact table name
    const tableInfo = await prisma.$queryRaw`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname='public' 
      AND LOWER(tablename)=LOWER('smlouva')
    `;
    
    const smlouvaTable = Array.isArray(tableInfo) && tableInfo.length > 0 
      ? tableInfo[0].tablename 
      : 'smlouva';
    
    // Check if zadavatel_adresa column exists
    const hasAddressCol = await checkColumnExists(smlouvaTable, 'zadavatel_adresa');
    
    let entityQuery;
    let searchPattern;
    
    if (entity.id === UNCATEGORIZED_ENTITY.id) {
      // Special query for "Nezařazeno" category - include all items not matching any city
      let cityExclusionConditions = [];
      
      for (const city of CITY_BASE_DATA) {
        if (hasAddressCol) {
          cityExclusionConditions.push(`(zadavatel_adresa NOT LIKE '%${city.name}%' OR zadavatel_adresa IS NULL)`);
        }
        cityExclusionConditions.push(`zadavatel NOT LIKE '%${city.name}%'`);
      }
      
      entityQuery = `
        SELECT 
          COUNT(*) as contract_count,
          SUM(castka) as total_value,
          AVG(castka) as avg_value,
          MAX(castka) as max_value,
          MIN(datum) as earliest_date,
          MAX(datum) as latest_date,
          COUNT(DISTINCT dodavatel) as supplier_count
        FROM "${smlouvaTable}"
        WHERE ${cityExclusionConditions.join(' AND ')}
      `;
      
      searchPattern = null; // Not needed for this query
    } else {
      // Regular city query
      if (hasAddressCol) {
        // Match contracts where address or authority name contains the city name
        entityQuery = `
          SELECT 
            COUNT(*) as contract_count,
            SUM(castka) as total_value,
            AVG(castka) as avg_value,
            MAX(castka) as max_value,
            MIN(datum) as earliest_date,
            MAX(datum) as latest_date,
            COUNT(DISTINCT dodavatel) as supplier_count
          FROM "${smlouvaTable}"
          WHERE zadavatel_adresa LIKE $1 OR zadavatel LIKE $1
        `;
      } else {
        // Fallback if no address column - use zadavatel containing city name
        entityQuery = `
          SELECT 
            COUNT(*) as contract_count,
            SUM(castka) as total_value,
            AVG(castka) as avg_value,
            MAX(castka) as max_value,
            MIN(datum) as earliest_date,
            MAX(datum) as latest_date,
            COUNT(DISTINCT dodavatel) as supplier_count
          FROM "${smlouvaTable}"
          WHERE zadavatel LIKE $1
        `;
      }
      
      searchPattern = `%${entity.name}%`;
    }
    
    // Run the query
    let stats;
    if (searchPattern) {
      stats = await prisma.$queryRawUnsafe(entityQuery, searchPattern);
    } else {
      stats = await prisma.$queryRawUnsafe(entityQuery);
    }
    
    const entityStats = Array.isArray(stats) && stats.length > 0 ? stats[0] : null;
    
    // Get top suppliers for this entity
    let suppliersQuery;
    
    if (entity.id === UNCATEGORIZED_ENTITY.id) {
      // Special query for "Nezařazeno" category
      let cityExclusionConditions = [];
      
      for (const city of CITY_BASE_DATA) {
        if (hasAddressCol) {
          cityExclusionConditions.push(`(zadavatel_adresa NOT LIKE '%${city.name}%' OR zadavatel_adresa IS NULL)`);
        }
        cityExclusionConditions.push(`zadavatel NOT LIKE '%${city.name}%'`);
      }
      
      suppliersQuery = `
        SELECT 
          dodavatel,
          COUNT(*) as contract_count,
          SUM(castka) as total_value
        FROM "${smlouvaTable}"
        WHERE ${cityExclusionConditions.join(' AND ')}
        GROUP BY dodavatel
        ORDER BY SUM(castka) DESC
        LIMIT 5
      `;
      
      searchPattern = null; // Not needed for this query
    } else {
      // Regular city query
      if (hasAddressCol) {
        // Using address and authority name
        suppliersQuery = `
          SELECT 
            dodavatel,
            COUNT(*) as contract_count,
            SUM(castka) as total_value
          FROM "${smlouvaTable}"
          WHERE zadavatel_adresa LIKE $1 OR zadavatel LIKE $1
          GROUP BY dodavatel
          ORDER BY SUM(castka) DESC
          LIMIT 5
        `;
      } else {
        // Fallback
        suppliersQuery = `
          SELECT 
            dodavatel,
            COUNT(*) as contract_count,
            SUM(castka) as total_value
          FROM "${smlouvaTable}"
          WHERE zadavatel LIKE $1
          GROUP BY dodavatel
          ORDER BY SUM(castka) DESC
          LIMIT 5
        `;
      }
      
      searchPattern = `%${entity.name}%`;
    }
    
    // Run suppliers query
    let topSuppliers;
    if (searchPattern) {
      topSuppliers = await prisma.$queryRawUnsafe(suppliersQuery, searchPattern);
    } else {
      topSuppliers = await prisma.$queryRawUnsafe(suppliersQuery);
    }
    
    // Combine all the data
    const entityDetail = {
      ...entity,
      stats: entityStats || {
        contract_count: 0,
        total_value: 0,
        avg_value: 0,
        max_value: 0,
        earliest_date: null,
        latest_date: null,
        supplier_count: 0
      },
      topSuppliers: Array.isArray(topSuppliers) ? topSuppliers : []
    };
    
    // Cache the detail
    await cacheStats(cacheKey, entityDetail);
    
    return entityDetail;
  } catch (error) {
    console.error(`Error fetching details for entity ${entityId}:`, error);
    return null;
  }
}

/**
 * Check if the database and required tables are available
 */
async function checkDatabaseAvailability(tableName: string): Promise<boolean> {
  try {
    // Try a simple query to check if the table exists and has data
    const result = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM "${tableName}" LIMIT 1
    `);
    
    return Array.isArray(result) && result.length > 0;
  } catch (error) {
    console.error("Database availability check failed:", error);
    return false;
  }
}

/**
 * Check if a column exists in a table
 */
async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = ${tableName}
        AND column_name = ${columnName}
      ) as exists
    `;
    
    return Array.isArray(result) && result.length > 0 && result[0].exists === true;
  } catch (error) {
    console.error(`Error checking if column ${columnName} exists in table ${tableName}:`, error);
    return false;
  }
}
