"use server"

import { prisma } from "@/lib/db-init"
import { getCachedStats, cacheStats } from "@/lib/cache"

// Definice typů entit
export type EntityType = "city" | "institution" | "company" | "other";

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
 * Extracts city name from Czech address
 */
function extractCityFromAddress(address: string | null): string | null {
  if (!address) return null;
  
  // Common city name patterns in Czech addresses
  // Typical format: "Street 123, 123 45 CityName" or "Street 123, CityName"
  
  // Split by comma to separate street from city/zip
  const parts = address.split(',');
  if (parts.length < 2) return null; // No comma found
  
  // Get the last part (should be city and possibly ZIP)
  const cityPart = parts[parts.length - 1].trim();
  
  // Try to match patterns with ZIP code
  // Czech ZIP is 3 digits, space, 2 digits, then city name
  const zipCityPattern = /^\d{3}\s*\d{2}\s+(.+)$/;
  const zipMatch = cityPart.match(zipCityPattern);
  
  if (zipMatch && zipMatch[1]) {
    return zipMatch[1].trim();
  }
  
  // If no ZIP pattern found, use the whole part after comma
  return cityPart;
}

/**
 * Normalizes a city name to a standard form
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
 * Get the base city data for a city name
 */
function getBaseCityData(cityName: string): (typeof CITY_BASE_DATA)[0] | null {
  if (!cityName) return null;
  
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
 * Fetches only city-based statistics by grouping all contracts by city from address
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

    // Check if zadavatel_adresa column exists
    const hasAddressCol = await checkColumnExists(smlouvaTable, 'zadavatel_adresa');
    
    if (!hasAddressCol) {
      console.warn("zadavatel_adresa column not found in database, using fallback data");
      return CITY_BASE_DATA.map(city => ({
        ...city,
        contractsCount: 0,
        totalValue: 0
      }));
    }

    // Get all contracts with addresses
    const contractAddresses = await prisma.$queryRawUnsafe(`
      SELECT 
        zadavatel_adresa as address,
        COUNT(*) as contract_count, 
        SUM(castka) as total_value
      FROM "${smlouvaTable}"
      WHERE zadavatel_adresa IS NOT NULL AND zadavatel_adresa != ''
      GROUP BY zadavatel_adresa
    `);
    
    // Map to track cities and their contract stats
    const cityStatsMap = new Map<string, EntityStats>();
    
    // First add all base cities with zero counts
    for (const baseCity of CITY_BASE_DATA) {
      cityStatsMap.set(normalizeCityName(baseCity.name), {
        ...baseCity,
        contractsCount: 0,
        totalValue: 0
      });
    }
    
    // Process each address and aggregate stats by city
    if (Array.isArray(contractAddresses)) {
      for (const item of contractAddresses) {
        const address = item.address;
        const contractCount = parseInt(item.contract_count || '0');
        const totalValue = parseFloat(item.total_value || '0');
        
        // Extract city from address
        const cityName = extractCityFromAddress(address);
        if (!cityName) continue;
        
        // Normalize the city name
        const normalizedCity = normalizeCityName(cityName);
        if (!normalizedCity) continue;
        
        // Find base city data
        const baseCity = getBaseCityData(cityName);
        
        if (cityStatsMap.has(normalizedCity)) {
          // Update existing city stats
          const existingStats = cityStatsMap.get(normalizedCity)!;
          cityStatsMap.set(normalizedCity, {
            ...existingStats,
            contractsCount: existingStats.contractsCount + contractCount,
            totalValue: existingStats.totalValue + totalValue
          });
        } else if (baseCity) {
          // New city found matching one of our base cities
          cityStatsMap.set(normalizedCity, {
            id: baseCity.id,
            name: baseCity.name, 
            population: baseCity.population,
            contractsCount: contractCount,
            totalValue: totalValue,
            entityType: "city"
          });
        } else {
          // New city not in our base list
          cityStatsMap.set(normalizedCity, {
            id: normalizedCity.replace(/\s+/g, '-'),
            name: cityName,
            population: 0, // Unknown population
            contractsCount: contractCount,
            totalValue: totalValue,
            entityType: "city"
          });
        }
      }
    }
    
    // Convert map to array and sort by contract count (descending)
    const cityStats = Array.from(cityStatsMap.values())
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
    
    // Find the specific city
    const city = allCities.find(c => c.id === entityId);
    
    if (!city) {
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
    
    // Prepare query based on whether address column exists
    let cityQuery;
    if (hasAddressCol) {
      // Match all contracts where address contains the city name
      cityQuery = `
        SELECT 
          COUNT(*) as contract_count,
          SUM(castka) as total_value,
          AVG(castka) as avg_value,
          MAX(castka) as max_value,
          MIN(datum) as earliest_date,
          MAX(datum) as latest_date,
          COUNT(DISTINCT dodavatel) as supplier_count
        FROM "${smlouvaTable}"
        WHERE zadavatel_adresa LIKE $1
      `;
    } else {
      // Fallback if no address column - use zadavatel containing city name
      cityQuery = `
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
    
    // Run the query with the city name as a parameter
    const searchPattern = `%${city.name}%`;
    const stats = await prisma.$queryRawUnsafe(cityQuery, searchPattern);
    
    const entityStats = Array.isArray(stats) && stats.length > 0 ? stats[0] : null;
    
    // Get top suppliers for this city
    let suppliersQuery;
    if (hasAddressCol) {
      // Using address column
      suppliersQuery = `
        SELECT 
          dodavatel,
          COUNT(*) as contract_count,
          SUM(castka) as total_value
        FROM "${smlouvaTable}"
        WHERE zadavatel_adresa LIKE $1
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
    
    const topSuppliers = await prisma.$queryRawUnsafe(suppliersQuery, searchPattern);
    
    // Combine all the data
    const cityDetail = {
      ...city,
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
    await cacheStats(cacheKey, cityDetail);
    
    return cityDetail;
  } catch (error) {
    console.error(`Error fetching details for city ${entityId}:`, error);
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
