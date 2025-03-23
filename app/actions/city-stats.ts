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

// Známé instituce a jejich typy
const KNOWN_INSTITUTIONS = [
  { pattern: /fakultní nemocnice/i, type: "institution" },
  { pattern: /nemocnice/i, type: "institution" },
  { pattern: /úřad/i, type: "institution" },
  { pattern: /ministerstvo/i, type: "institution" },
  { pattern: /dopravní podnik/i, type: "company" },
  { pattern: /kraj$/i, type: "institution" },
  { pattern: /univerzita/i, type: "institution" },
  { pattern: /vysoká škola/i, type: "institution" },
  { pattern: /záchranná služba/i, type: "institution" },
  { pattern: /statutární město/i, type: "city" },
  { pattern: /hlavní město/i, type: "city" },
];

// Typ pro statistiky měst/institucí
export type EntityStats = {
  id: string;
  name: string;
  population: number;
  contractsCount: number;
  totalValue: number;
  entityType: EntityType;
};

/**
 * Detekuje typ entity podle názvu
 */
function detectEntityType(name: string): EntityType {
  // Nejprve zkontrolovat, zda jde o známou instituci
  for (const inst of KNOWN_INSTITUTIONS) {
    if (inst.pattern.test(name)) {
      return inst.type;
    }
  }
  
  // Zkontrolovat, zda jde o město ze základního seznamu
  const isCityInBaseList = CITY_BASE_DATA.some(city => 
    city.name.toLowerCase() === name.toLowerCase() ||
    name.toLowerCase().includes(city.name.toLowerCase())
  );
  
  if (isCityInBaseList) {
    return "city";
  }
  
  return "other";
}

/**
 * Generuje ID z názvu entity
 */
function generateIdFromName(name: string): string {
  return name.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // Odstranit diakritiku
    .replace(/[^a-z0-9]/g, "-")      // Nahradit nealfanumerické znaky pomlčkami
    .replace(/-+/g, "-")              // Nahradit více pomlček jednou
    .replace(/^-|-$/g, "");           // Odstranit pomlčky na začátku a konci
}

/**
 * Extracte city name from address
 */
function extractCityFromAddress(address: string | null): string | null {
  if (!address) return null;
  
  // Try to extract city from address
  // Typical format is "Street, City" or "Street, ZIP City"
  const parts = address.split(',');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].trim();
    // Check if there's a ZIP code (typically 5 digits in Czech Republic)
    const zipMatch = lastPart.match(/^\d{3}\s*\d{2}\s+(.+)$/);
    if (zipMatch && zipMatch[1]) {
      return zipMatch[1].trim();
    }
    // Otherwise use the last part as city
    return lastPart;
  }
  
  return null;
}

/**
 * Helper to get city name from entity name
 */
function getCityNameFromEntity(name: string): string | null {
  // Known patterns where city name appears in entity name
  const patterns = [
    /(?:statutární|hlavní) město ([A-ZÁ-Ž][a-zá-ž]+)/i,  // "Statutární město Brno" -> "Brno"
    /^(?:město|obec) ([A-ZÁ-Ž][a-zá-ž]+)/i,  // "Město Plzeň" -> "Plzeň"
    /^([A-ZÁ-Ž][a-zá-ž]+)$/i,  // Just the city name like "Olomouc"
    /městská část ([A-ZÁ-Ž][a-zá-ž]+)/i,  // "Městská část Praha" -> "Praha"
  ];
  
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Special case for Prague districts
  if (/praha \d+/i.test(name) || /praha-[a-zá-ž]+/i.test(name)) {
    return "Praha";
  }
  
  return null;
}

/**
 * Normalized city to base form
 */
function normalizeCityName(name: string): string {
  const normalized = name.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // Remove diacritics
    .trim();
  
  // Special cases for common city name variations
  if (normalized.includes("prag") || normalized.includes("prah")) {
    return "praha";
  }
  
  // For other cities, normalize and match against base data
  for (const city of CITY_BASE_DATA) {
    const baseCityNormalized = city.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    
    if (normalized === baseCityNormalized || 
        normalized.includes(baseCityNormalized) || 
        baseCityNormalized.includes(normalized)) {
      return baseCityNormalized;
    }
  }
  
  return normalized;
}

/**
 * Fetches statistics about cities and their contract counts from the database
 */
export async function fetchCityStats(): Promise<EntityStats[]> {
  try {
    // Try to get from cache first
    const cachedData = await getCachedStats("cityStats");
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
      await cacheStats("cityStats", fallbackData, 300);
      
      return fallbackData;
    }

    // Check if zadavatel_adresa column exists
    const hasAddressCol = await checkColumnExists(smlouvaTable, 'zadavatel_adresa');

    // Get stats by zadavatel with address for city grouping
    let rawQuery;
    if (hasAddressCol) {
      rawQuery = `
        SELECT 
          zadavatel as entity_name,
          zadavatel_adresa as address,
          COUNT(*) as contract_count,
          SUM(castka) as total_value
        FROM "${smlouvaTable}"
        WHERE zadavatel IS NOT NULL AND zadavatel != 'Neuvedeno'
        GROUP BY zadavatel, zadavatel_adresa
        ORDER BY COUNT(*) DESC
        LIMIT 200
      `;
    } else {
      // Fallback if no address column exists
      rawQuery = `
        SELECT 
          zadavatel as entity_name,
          NULL as address,
          COUNT(*) as contract_count,
          SUM(castka) as total_value
        FROM "${smlouvaTable}"
        WHERE zadavatel IS NOT NULL AND zadavatel != 'Neuvedeno'
        GROUP BY zadavatel
        ORDER BY COUNT(*) DESC
        LIMIT 200
      `;
    }

    const statsByEntity = await prisma.$queryRawUnsafe(rawQuery);

    // Transform data and categorize entities
    const entitiesData: EntityStats[] = [];
    
    // Prepare city data map for grouping
    const cityDataMap = new Map<string, {
      id: string;
      name: string;
      population: number;
      contractsCount: number;
      totalValue: number;
      entityType: EntityType;
    }>();
    
    if (Array.isArray(statsByEntity)) {
      for (const item of statsByEntity) {
        const entityName = item.entity_name || 'Neuvedeno';
        const entityAddress = item.address;
        const contractCount = parseInt(item.contract_count || '0');
        const totalValue = parseFloat(item.total_value || '0');
        
        // Skip entities with too few contracts
        if (contractCount < 2) continue;
        
        // Detect entity type
        const entityType = detectEntityType(entityName);
        
        // Try to extract city from entity name or address
        let cityName = null;
        
        // First try to get city from entity name
        cityName = getCityNameFromEntity(entityName);
        
        // If unsuccessful, try to extract from address
        if (!cityName && entityAddress) {
          cityName = extractCityFromAddress(entityAddress);
        }
        
        // If we found a city, add stats to that city
        if (cityName) {
          const normalizedCityName = normalizeCityName(cityName);
          
          // Find base city data for more precise information
          const baseCity = CITY_BASE_DATA.find(city => 
            normalizeCityName(city.name) === normalizedCityName
          );
          
          // Skip if we can't find a matching base city and the entity is not explicitly a city
          if (!baseCity && entityType !== "city") {
            // This is an institution in some unknown city, skip it
            continue;
          }
          
          // Use base city data where available
          const cityId = baseCity?.id || generateIdFromName(cityName);
          const cityDisplayName = baseCity?.name || cityName;
          const cityPopulation = baseCity?.population || 0;
          
          // Update or create city data
          if (cityDataMap.has(normalizedCityName)) {
            // Update existing city
            const existingCity = cityDataMap.get(normalizedCityName)!;
            cityDataMap.set(normalizedCityName, {
              ...existingCity,
              contractsCount: existingCity.contractsCount + contractCount,
              totalValue: existingCity.totalValue + totalValue,
            });
          } else {
            // Create new city entry
            cityDataMap.set(normalizedCityName, {
              id: cityId,
              name: cityDisplayName,
              population: cityPopulation,
              contractsCount: contractCount,
              totalValue: totalValue,
              entityType: "city"
            });
          }
        }
        else if (entityType === "city") {
          // This is explicitly a city but we couldn't extract a standard city name
          // Use the entity name as is
          const entityId = generateIdFromName(entityName);
          
          // Find population for known cities
          let population = 0;
          const baseCity = CITY_BASE_DATA.find(city => 
            city.name.toLowerCase() === entityName.toLowerCase() ||
            entityName.toLowerCase().includes(city.name.toLowerCase())
          );
          
          if (baseCity) {
            population = baseCity.population;
          }
          
          const normalizedName = normalizeCityName(entityName);
          
          // Update or create city data
          if (cityDataMap.has(normalizedName)) {
            // Update existing city
            const existingCity = cityDataMap.get(normalizedName)!;
            cityDataMap.set(normalizedName, {
              ...existingCity,
              contractsCount: existingCity.contractsCount + contractCount,
              totalValue: existingCity.totalValue + totalValue,
            });
          } else {
            // Create new city entry
            cityDataMap.set(normalizedName, {
              id: entityId,
              name: baseCity?.name || entityName,
              population,
              contractsCount: contractCount,
              totalValue: totalValue,
              entityType: "city"
            });
          }
        }
        // Else this is an institution or company without city info, skip it for the cities page
      }
    }
    
    // Convert city map to array
    const cityArray = Array.from(cityDataMap.values());
    
    // Add cities from base data that aren't in the results
    for (const baseCity of CITY_BASE_DATA) {
      const normalizedName = normalizeCityName(baseCity.name);
      
      if (!cityDataMap.has(normalizedName)) {
        cityArray.push({
          ...baseCity,
          contractsCount: 0,
          totalValue: 0
        });
      }
    }
    
    // Sort by contract count (descending)
    const sortedData = cityArray.sort((a, b) => b.contractsCount - a.contractsCount);
    
    // Cache the results
    await cacheStats("cityStats", sortedData);
    
    return sortedData;
  } catch (error) {
    console.error("Error fetching city stats:", error);
    
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
 * Fetch stats for actual cities only (filtering out other entities)
 */
export async function fetchActualCityStats(): Promise<EntityStats[]> {
  const cityStats = await fetchCityStats();
  
  // We already have city stats grouped by city, just return them
  return cityStats;
}

/**
 * Fetch stats for institutions only (filtering out cities and other entities)
 */
export async function fetchInstitutionStats(): Promise<EntityStats[]> {
  const allEntities = await fetchCityStats();
  
  // Filter to only include institutions
  return allEntities.filter(entity => 
    entity.entityType === "institution"
  );
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
    
    // Get all entity data
    const allEntities = await fetchCityStats();
    
    // Find the specific entity
    const entity = allEntities.find(e => e.id === entityId);
    
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
    
    // Get entity-specific contract stats
    const stats = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) as contract_count,
        SUM(castka) as total_value,
        AVG(castka) as avg_value,
        MAX(castka) as max_value,
        MIN(datum) as earliest_date,
        MAX(datum) as latest_date,
        COUNT(DISTINCT dodavatel) as supplier_count
      FROM "${smlouvaTable}"
      WHERE zadavatel = $1
    `, entity.name);
    
    const entityStats = Array.isArray(stats) && stats.length > 0 ? stats[0] : null;
    
    // Get top suppliers for this entity
    const topSuppliers = await prisma.$queryRawUnsafe(`
      SELECT 
        dodavatel,
        COUNT(*) as contract_count,
        SUM(castka) as total_value
      FROM "${smlouvaTable}"
      WHERE zadavatel = $1
      GROUP BY dodavatel
      ORDER BY SUM(castka) DESC
      LIMIT 5
    `, entity.name);
    
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
