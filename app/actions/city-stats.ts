"use server"

import { prisma } from "@/lib/db-init"
import { getCachedStats, cacheStats } from "@/lib/cache"

// Basic city data with population (for cities where we don't have contract data)
const CITY_BASE_DATA = [
  { id: "praha", name: "Praha", population: 1309000 },
  { id: "brno", name: "Brno", population: 382000 },
  { id: "ostrava", name: "Ostrava", population: 287000 },
  { id: "plzen", name: "Plzeň", population: 174000 },
  { id: "liberec", name: "Liberec", population: 104000 },
  { id: "olomouc", name: "Olomouc", population: 100000 },
  { id: "ceske-budejovice", name: "České Budějovice", population: 94000 },
  { id: "hradec-kralove", name: "Hradec Králové", population: 92000 },
  { id: "usti-nad-labem", name: "Ústí nad Labem", population: 92000 },
  { id: "pardubice", name: "Pardubice", population: 91000 },
  { id: "zlin", name: "Zlín", population: 75000 },
  { id: "havirov", name: "Havířov", population: 71000 },
  { id: "kladno", name: "Kladno", population: 69000 },
  { id: "most", name: "Most", population: 66000 },
  { id: "opava", name: "Opava", population: 56000 },
  { id: "frydek-mistek", name: "Frýdek-Místek", population: 55000 },
  { id: "karvina", name: "Karviná", population: 52000 },
  { id: "jihlava", name: "Jihlava", population: 51000 },
  { id: "teplice", name: "Teplice", population: 50000 },
  { id: "decin", name: "Děčín", population: 49000 },
];

// Type for city stats
export type CityStats = {
  id: string;
  name: string;
  population: number;
  contractsCount: number;
  totalValue: number;
};

/**
 * Fetches statistics about cities and their contract counts from the database
 */
export async function fetchCityStats(): Promise<CityStats[]> {
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

    // Get counts by city (using zadavatel field which contains city names)
    const contractsByCity = await prisma.$queryRawUnsafe(`
      SELECT 
        LOWER(zadavatel) as city_id,
        zadavatel as city_name,
        COUNT(*) as contract_count,
        SUM(castka) as total_value
      FROM "${smlouvaTable}"
      WHERE zadavatel IS NOT NULL
      GROUP BY zadavatel
      ORDER BY COUNT(*) DESC
      LIMIT 30
    `);

    // Combine with base data to get population numbers and ensure all major cities are included
    const combinedData: CityStats[] = [];
    
    // Process cities from database
    if (Array.isArray(contractsByCity)) {
      for (const dbCity of contractsByCity) {
        // Find matching base city data
        const baseCity = CITY_BASE_DATA.find(c => 
          c.id === dbCity.city_id || 
          c.name.toLowerCase() === dbCity.city_name.toLowerCase()
        );
        
        if (baseCity) {
          combinedData.push({
            id: baseCity.id,
            name: baseCity.name,
            population: baseCity.population,
            contractsCount: parseInt(dbCity.contract_count || '0'),
            totalValue: parseFloat(dbCity.total_value || '0')
          });
        } else if (dbCity.contract_count > 5) {
          // Include cities not in our base list but with significant contracts
          // Use simplified ID based on city name
          const cityId = dbCity.city_name.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")  // Remove diacritics
            .replace(/[^a-z0-9]/g, "-");      // Replace non-alphanumeric with hyphens
            
          combinedData.push({
            id: cityId,
            name: dbCity.city_name,
            population: 0, // Unknown population
            contractsCount: parseInt(dbCity.contract_count || '0'),
            totalValue: parseFloat(dbCity.total_value || '0')
          });
        }
      }
    }
    
    // Add any missing base cities
    for (const baseCity of CITY_BASE_DATA) {
      const exists = combinedData.some(c => c.id === baseCity.id);
      
      if (!exists) {
        combinedData.push({
          ...baseCity,
          contractsCount: 0,
          totalValue: 0
        });
      }
    }
    
    // Sort by contract count (descending)
    const sortedData = combinedData.sort((a, b) => b.contractsCount - a.contractsCount);
    
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
 * Fetch details for a specific city
 */
export async function fetchCityDetail(cityId: string) {
  try {
    // Try to get from cache first
    const cacheKey = `cityDetail:${cityId}`;
    const cachedData = await getCachedStats(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }
    
    // Get base city data
    const baseCity = CITY_BASE_DATA.find(c => c.id === cityId);
    
    if (!baseCity) {
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
    
    // Get city-specific contract stats
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
      WHERE LOWER(zadavatel) = LOWER($1)
    `, baseCity.name);
    
    const cityStats = Array.isArray(stats) && stats.length > 0 ? stats[0] : null;
    
    // Get top suppliers for this city
    const topSuppliers = await prisma.$queryRawUnsafe(`
      SELECT 
        dodavatel,
        COUNT(*) as contract_count,
        SUM(castka) as total_value
      FROM "${smlouvaTable}"
      WHERE LOWER(zadavatel) = LOWER($1)
      GROUP BY dodavatel
      ORDER BY SUM(castka) DESC
      LIMIT 5
    `, baseCity.name);
    
    // Combine all the data
    const cityDetail = {
      ...baseCity,
      stats: cityStats || {
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
    console.error(`Error fetching details for city ${cityId}:`, error);
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
