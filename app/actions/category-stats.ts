"use server"

import { prisma } from "@/lib/db-init"
import { getCachedStats, cacheStats } from "@/lib/cache"

// Define base category data (for cases where we don't have actual contract data)
const CATEGORY_BASE_DATA = [
  { 
    id: "verejne-zakazky", 
    name: "Veřejné zakázky", 
    description: "Všechny veřejné zakázky zadané státními institucemi a samosprávami.",
    field: "kategorie",
    matchValues: ["verejne-zakazky", "veřejné zakázky", "zakazka", "zakázka"]
  },
  { 
    id: "dotace", 
    name: "Dotace a granty", 
    description: "Smlouvy související s poskytováním dotací a grantů ze státního rozpočtu a fondů EU.",
    field: "kategorie",
    matchValues: ["dotace", "grant", "subvence", "podpora"]
  },
  { 
    id: "prodej-majetku", 
    name: "Prodej majetku", 
    description: "Smlouvy o prodeji státního a obecního majetku.",
    field: "kategorie",
    matchValues: ["prodej", "prodej-majetku", "prodej majetku", "zcizení", "převod majetku"]
  },
  { 
    id: "najem", 
    name: "Nájmy", 
    description: "Nájemní smlouvy, kde je pronajímatelem nebo nájemcem subjekt veřejné správy.",
    field: "kategorie",
    matchValues: ["najem", "nájem", "pronájem", "pacht"]
  },
  { 
    id: "silnice", 
    name: "Silnice a doprava", 
    description: "Zakázky na výstavbu a rekonstrukci silnic, dálnic a dopravní infrastruktury.",
    field: "nazev", // This category might be in the title
    matchValues: ["silnice", "dálnice", "most", "doprava", "komunikace", "rekonstrukce silnice", "oprava silnice"]
  },
  { 
    id: "skolstvi", 
    name: "Školství", 
    description: "Zakázky související se školstvím, vysokými školami a vzdělávacími institucemi.",
    field: "nazev",
    matchValues: ["škola", "školství", "vzdělávání", "univerzita", "školy", "rekonstrukce školy", "oprava školy"]
  },
  { 
    id: "zdravotnictvi", 
    name: "Zdravotnictví", 
    description: "Zakázky v oblasti zdravotnictví, nemocnic a zdravotnických zařízení.",
    field: "nazev",
    matchValues: ["nemocnice", "zdravotnictví", "zdravotnické", "lékařské", "zdravotní"]
  },
  { 
    id: "kultura", 
    name: "Kultura", 
    description: "Zakázky v oblasti kultury, umění a kulturního dědictví.",
    field: "nazev",
    matchValues: ["kultura", "kulturní", "divadlo", "muzeum", "galerie", "knihovna"]
  },
  { 
    id: "sport", 
    name: "Sport", 
    description: "Zakázky na výstavbu a rekonstrukci sportovišť a sportovních zařízení.",
    field: "nazev",
    matchValues: ["sport", "sportovní", "hřiště", "stadion", "sportovní hala", "bazén"]
  },
  { 
    id: "ostatni", 
    name: "Ostatní smlouvy", 
    description: "Další typy smluv, které nespadají do žádné z výše uvedených kategorií.",
    field: "kategorie",
    matchValues: ["ostatni", "ostatní", "jiné", "různé"]
  },
];

// Type for category stats
export type CategoryStats = {
  id: string;
  name: string;
  description: string;
  contractsCount: number;
  totalValue: number;
  avgValue: number;
};

/**
 * Fetches statistics about contract categories from the database
 */
export async function fetchCategoryStats(): Promise<CategoryStats[]> {
  try {
    // Try to get from cache first
    const cachedData = await getCachedStats("categoryStats");
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
      const fallbackData = CATEGORY_BASE_DATA.map(category => ({
        id: category.id,
        name: category.name,
        description: category.description,
        contractsCount: 0,
        totalValue: 0,
        avgValue: 0
      }));
      
      // Cache this data briefly (5 minutes)
      await cacheStats("categoryStats", fallbackData, 300);
      
      return fallbackData;
    }

    // Check if kategorie field exists in the table
    const hasKategorieField = await checkFieldExists(smlouvaTable, 'kategorie');
    
    // Initialize results
    const results: CategoryStats[] = [];
    
    // If kategorie field exists, count by category
    if (hasKategorieField) {
      const categoryCounts = await prisma.$queryRawUnsafe(`
        SELECT 
          kategorie,
          COUNT(*) as contract_count,
          SUM(castka) as total_value,
          AVG(castka) as avg_value
        FROM "${smlouvaTable}"
        WHERE kategorie IS NOT NULL AND kategorie != ''
        GROUP BY kategorie
        ORDER BY COUNT(*) DESC
      `);
      
      // Process category stats
      if (Array.isArray(categoryCounts)) {
        for (const category of CATEGORY_BASE_DATA) {
          // Find matching database category
          const matchingCategories = categoryCounts.filter((c: any) => 
            category.matchValues.some(val => 
              c.kategorie?.toLowerCase() === val.toLowerCase()
            )
          );
          
          if (matchingCategories.length > 0) {
            // Combine stats from all matching categories
            const totalCount = matchingCategories.reduce((sum, c) => sum + parseInt(c.contract_count || '0'), 0);
            const totalValue = matchingCategories.reduce((sum, c) => sum + parseFloat(c.total_value || '0'), 0);
            const avgValue = totalCount > 0 ? totalValue / totalCount : 0;
            
            results.push({
              id: category.id,
              name: category.name,
              description: category.description,
              contractsCount: totalCount,
              totalValue: totalValue,
              avgValue: avgValue
            });
          } else {
            // Add with zero values if no matches
            results.push({
              id: category.id,
              name: category.name,
              description: category.description,
              contractsCount: 0,
              totalValue: 0,
              avgValue: 0
            });
          }
        }
      }
    } else {
      // If no kategorie field, try to determine categories from the title/description
      for (const category of CATEGORY_BASE_DATA) {
        if (category.field === 'nazev') {
          const matchConditions = category.matchValues.map(val => 
            `LOWER(nazev) LIKE '%${val.toLowerCase()}%'`
          ).join(' OR ');
          
          const query = `
            SELECT 
              COUNT(*) as contract_count,
              SUM(castka) as total_value,
              AVG(castka) as avg_value
            FROM "${smlouvaTable}"
            WHERE ${matchConditions}
          `;
          
          try {
            const categoryStats = await prisma.$queryRawUnsafe(query);
            
            if (Array.isArray(categoryStats) && categoryStats.length > 0) {
              const stats = categoryStats[0];
              
              results.push({
                id: category.id,
                name: category.name,
                description: category.description,
                contractsCount: parseInt(stats.contract_count || '0'),
                totalValue: parseFloat(stats.total_value || '0'),
                avgValue: parseFloat(stats.avg_value || '0')
              });
            } else {
              // Add with zero values if no matches
              results.push({
                id: category.id,
                name: category.name,
                description: category.description,
                contractsCount: 0,
                totalValue: 0,
                avgValue: 0
              });
            }
          } catch (error) {
            console.error(`Error querying for category ${category.id}:`, error);
            // Add with zero values on error
            results.push({
              id: category.id,
              name: category.name,
              description: category.description,
              contractsCount: 0,
              totalValue: 0,
              avgValue: 0
            });
          }
        } else {
          // For categories that aren't primarily determined by title
          results.push({
            id: category.id,
            name: category.name,
            description: category.description,
            contractsCount: 0,
            totalValue: 0,
            avgValue: 0
          });
        }
      }
    }
    
    // Make sure "ostatni" category is included
    if (!results.some(c => c.id === 'ostatni')) {
      const ostatni = CATEGORY_BASE_DATA.find(c => c.id === 'ostatni');
      if (ostatni) {
        results.push({
          id: ostatni.id,
          name: ostatni.name,
          description: ostatni.description,
          contractsCount: 0,
          totalValue: 0,
          avgValue: 0
        });
      }
    }
    
    // Sort by contract count (descending)
    const sortedData = results.sort((a, b) => b.contractsCount - a.contractsCount);
    
    // Cache the results
    await cacheStats("categoryStats", sortedData);
    
    return sortedData;
  } catch (error) {
    console.error("Error fetching category stats:", error);
    
    // Return base data with zero counts in case of error
    const fallbackData = CATEGORY_BASE_DATA.map(category => ({
      id: category.id,
      name: category.name,
      description: category.description,
      contractsCount: 0,
      totalValue: 0,
      avgValue: 0
    }));
    
    return fallbackData;
  }
}

/**
 * Fetch details for a specific category
 */
export async function fetchCategoryDetail(categoryId: string) {
  try {
    // Try to get from cache first
    const cacheKey = `categoryDetail:${categoryId}`;
    const cachedData = await getCachedStats(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }
    
    // Get base category data
    const baseCategory = CATEGORY_BASE_DATA.find(c => c.id === categoryId);
    
    if (!baseCategory) {
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
    
    // Check if kategorie field exists in the table
    const hasKategorieField = await checkFieldExists(smlouvaTable, 'kategorie');
    
    // Build the WHERE clause based on category matching and field
    let whereClause = '';
    
    if (hasKategorieField && baseCategory.field === 'kategorie') {
      // Use exact kategorie field matching
      const matchConditions = baseCategory.matchValues.map(val => 
        `LOWER(kategorie) = '${val.toLowerCase()}'`
      ).join(' OR ');
      
      whereClause = `WHERE ${matchConditions}`;
    } else {
      // Use title/description matching
      const matchConditions = baseCategory.matchValues.map(val => 
        `LOWER(nazev) LIKE '%${val.toLowerCase()}%'`
      ).join(' OR ');
      
      whereClause = `WHERE ${matchConditions}`;
    }
    
    // Get category-specific contract stats
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
      ${whereClause}
    `);
    
    const categoryStats = Array.isArray(stats) && stats.length > 0 ? stats[0] : null;
    
    // Get top suppliers for this category
    const topSuppliers = await prisma.$queryRawUnsafe(`
      SELECT 
        dodavatel,
        COUNT(*) as contract_count,
        SUM(castka) as total_value
      FROM "${smlouvaTable}"
      ${whereClause}
      GROUP BY dodavatel
      ORDER BY SUM(castka) DESC
      LIMIT 5
    `);
    
    // Combine all the data
    const categoryDetail = {
      ...baseCategory,
      stats: categoryStats || {
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
    await cacheStats(cacheKey, categoryDetail);
    
    return categoryDetail;
  } catch (error) {
    console.error(`Error fetching details for category ${categoryId}:`, error);
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
 * Check if a specific field exists in a table
 */
async function checkFieldExists(tableName: string, fieldName: string): Promise<boolean> {
  try {
    const query = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '${tableName}' 
      AND column_name = '${fieldName}'
    `;
    
    const result = await prisma.$queryRawUnsafe(query);
    
    return Array.isArray(result) && result.length > 0;
  } catch (error) {
    console.error(`Error checking if field ${fieldName} exists in table ${tableName}:`, error);
    return false;
  }
}
