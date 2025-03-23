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

    // Get stats by zadavatel (client/authority)
    const statsByEntity = await prisma.$queryRawUnsafe(`
      SELECT 
        zadavatel as entity_name,
        COUNT(*) as contract_count,
        SUM(castka) as total_value
      FROM "${smlouvaTable}"
      WHERE zadavatel IS NOT NULL AND zadavatel != 'Neuvedeno'
      GROUP BY zadavatel
      ORDER BY COUNT(*) DESC
      LIMIT 100
    `);

    // Transform data and categorize entities
    const entitiesData: EntityStats[] = [];
    
    if (Array.isArray(statsByEntity)) {
      for (const item of statsByEntity) {
        const entityName = item.entity_name || 'Neuvedeno';
        const contractCount = parseInt(item.contract_count || '0');
        const totalValue = parseFloat(item.total_value || '0');
        
        // Skip entities with too few contracts
        if (contractCount < 3) continue;
        
        // Detect entity type
        const entityType = detectEntityType(entityName);
        
        // Generate an ID
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
        
        entitiesData.push({
          id: entityId,
          name: entityName,
          population,
          contractsCount: contractCount,
          totalValue,
          entityType
        });
      }
    }
    
    // Add cities from base data that aren't in the results
    for (const baseCity of CITY_BASE_DATA) {
      const exists = entitiesData.some(entity => 
        entity.id === baseCity.id || 
        entity.name.toLowerCase() === baseCity.name.toLowerCase()
      );
      
      if (!exists) {
        entitiesData.push({
          ...baseCity,
          contractsCount: 0,
          totalValue: 0
        });
      }
    }
    
    // Sort by contract count (descending)
    const sortedData = entitiesData.sort((a, b) => b.contractsCount - a.contractsCount);
    
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
  const allEntities = await fetchCityStats();
  
  // Create a map to deduplicate cities by normalized name
  const citiesMap = new Map<string, EntityStats>();
  
  // Helper function to normalize city names
  const normalizeCity = (name: string): string => {
    // Remove phrases like "statutární město", "hlavní město", etc.
    let normalized = name.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")  // Remove diacritics
      .replace(/(statutarni|hlavni|mestska cast)\s+(mesto|cast)/g, "")
      .replace(/\s+/g, " ")
      .trim();
      
    // Extract just the city name from entities like "Městská část Praha 10"
    if (normalized.includes("praha")) {
      // If it's a city district (Praha X), use just "Praha" for grouping
      normalized = "praha";
    }
    
    return normalized;
  };
  
  // Process all entities of type "city" and properly handle city districts, etc.
  allEntities
    .filter(entity => entity.entityType === "city" || entity.name.toLowerCase().includes("praha"))
    .forEach(entity => {
      const normalizedName = normalizeCity(entity.name);
      
      // Skip entities that don't normalize to a valid city name
      if (!normalizedName) return;
      
      // Find base city data (for proper display name, population, etc.)
      const baseCity = CITY_BASE_DATA.find(c => 
        normalizeCity(c.name) === normalizedName || 
        c.name.toLowerCase().includes(normalizedName)
      );
      
      // If it's not in our base cities list and doesn't look like a city, skip it
      if (!baseCity && !CITY_BASE_DATA.some(c => normalizedName.includes(normalizeCity(c.name)))) {
        return;
      }
      
      // If we've already seen this city, update the stats
      if (citiesMap.has(normalizedName)) {
        const existingCity = citiesMap.get(normalizedName)!;
        
        citiesMap.set(normalizedName, {
          ...existingCity,
          contractsCount: existingCity.contractsCount + entity.contractsCount,
          totalValue: existingCity.totalValue + entity.totalValue,
          // Prefer the base city data for name and population
          name: baseCity?.name || existingCity.name,
          population: baseCity?.population || existingCity.population,
        });
      } else {
        // Use base city data where available
        citiesMap.set(normalizedName, {
          id: baseCity?.id || entity.id,
          name: baseCity?.name || entity.name,
          population: baseCity?.population || entity.population,
          contractsCount: entity.contractsCount,
          totalValue: entity.totalValue,
          entityType: "city",
        });
      }
    });
  
  // Add any missing base cities with zero contracts
  CITY_BASE_DATA.forEach(baseCity => {
    const normalizedName = normalizeCity(baseCity.name);
    
    if (!citiesMap.has(normalizedName)) {
      citiesMap.set(normalizedName, {
        ...baseCity,
        contractsCount: 0,
        totalValue: 0,
      });
    }
  });
  
  // Convert map back to array and sort by population (descending)
  return Array.from(citiesMap.values()).sort((a, b) => b.population - a.population);
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