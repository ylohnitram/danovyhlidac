import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import xml2js from 'xml2js'
import { PrismaClient } from '@prisma/client'
import os from 'os'

// Vytvoření nové instance PrismaClient 
// s doporučeným nastavením pro konzolové aplikace
const prisma = new PrismaClient({
  log: ['error', 'warn'],
})

console.log('Using PrismaClient with connection:', process.env.DATABASE_URL || 'default connection');

const TEMP_DIR = '/tmp/smlouvy-dumps'

// Create temp directory if it doesn't exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

// Rozšířená definice typů pro contractData
interface ContractData {
  nazev: string;
  castka: number;
  kategorie: string;
  datum: Date;
  dodavatel: string;
  zadavatel: string;
  typ_rizeni: string;
  lat?: number;
  lng?: number;
}

// Function to download XML dump for a specific month
async function downloadXmlDump(year: number, month: number): Promise<string> {
  // Format month as two digits
  const monthFormatted = month.toString().padStart(2, '0')
  const fileName = `dump_${year}_${monthFormatted}.xml`
  const url = `https://data.smlouvy.gov.cz/${fileName}`
  
  console.log(`Downloading data dump from: ${url}`)
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`)
    }
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'smlouvy-dumps')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    // Save the file
    const filePath = path.join(tempDir, fileName)
    const fileStream = fs.createWriteStream(filePath)
    
    return new Promise((resolve, reject) => {
      if (!response.body) {
        reject(new Error('Response body is null'))
        return
      }
      
      response.body.pipe(fileStream)
      response.body.on('error', (err) => {
        reject(err)
      })
      fileStream.on('finish', () => {
        console.log(`File downloaded to: ${filePath}`)
        resolve(filePath)
      })
    })
  } catch (error) {
    console.error(`Error downloading dump for ${year}-${monthFormatted}:`, error)
    throw error
  }
}

// Function to parse XML dump and extract contract data
async function parseXmlDump(filePath: string) {
  console.log(`Parsing XML dump: ${filePath}`)
  
  try {
    console.log(`Reading file: ${filePath}`)
    const xmlData = fs.readFileSync(filePath, 'utf8')
    console.log(`File read successfully. Size: ${xmlData.length} bytes`)
    const parser = new xml2js.Parser({ explicitArray: true })
    
    return new Promise<any[]>((resolve, reject) => {
      parser.parseString(xmlData, (err, result) => {
        if (err) {
          console.error(`XML parsing error: ${err.message}`)
          reject(err)
          return
        }
        
        try {
          console.log('XML structure root elements:', Object.keys(result || {}))
          
          if (!result) {
            console.warn('Result is undefined or null')
            resolve([])
            return
          }
          
          // Based on the logs, we can see that contracts are in dump.zaznam
          if (result.dump && result.dump.zaznam) {
            const records = result.dump.zaznam
            console.log(`Found ${records.length} records in the XML dump under dump.zaznam`)
            resolve(records)
            return
          }
          
          // Check other possible structures as fallback
          if (result.dump) {
            if (result.dump.smlouva) {
              const contracts = result.dump.smlouva
              const contractsArray = Array.isArray(contracts) ? contracts : [contracts]
              console.log(`Found ${contractsArray.length} contracts in the XML dump under dump.smlouva`)
              resolve(contractsArray)
              return
            }
            
            if (result.dump.smlouvy) {
              console.log('Found smlouvy under dump. Checking its properties:', Object.keys(result.dump.smlouvy[0] || {}))
              const contracts = result.dump.smlouvy[0]?.smlouva || []
              const contractsArray = Array.isArray(contracts) ? contracts : [contracts]
              console.log(`Found ${contractsArray.length} contracts in the XML dump under dump.smlouvy.smlouva`)
              resolve(contractsArray)
              return
            }
            
            if (result.dump.zaznamy) {
              console.log('Found zaznamy element. Checking its properties:', Object.keys(result.dump.zaznamy[0] || {}))
              if (result.dump.zaznamy[0]?.zaznam) {
                const records = result.dump.zaznamy[0].zaznam
                console.log(`Found ${records.length} records in the XML dump under dump.zaznamy.zaznam`)
                resolve(records)
                return
              }
            }
          } else if (result.smlouvy) {
            const contracts = result.smlouvy[0]?.smlouva || []
            const contractsArray = Array.isArray(contracts) ? contracts : [contracts]
            console.log(`Found ${contractsArray.length} contracts in the XML dump under smlouvy.smlouva`)
            resolve(contractsArray)
            return
          }
          
          console.warn('Could not locate contracts in the XML structure')
          resolve([]) // Return empty array instead of failing
        } catch (parseError) {
          console.error(`Error processing parsed XML:`, parseError)
          reject(parseError)
        }
      })
    })
  } catch (error) {
    console.error(`Error parsing XML dump: ${filePath}`, error)
    throw error
  }
}

// Function to transform XML contract data to database format
function transformContractData(record: any): ContractData | null {
  try {
    // Check if this is a 'zaznam' record with smlouva inside
    const contract = record.smlouva ? record.smlouva[0] : record;
    
    // Log the contract structure to debug
    if (process.env.DEBUG) {
      console.log('Contract structure:', JSON.stringify(Object.keys(contract), null, 2));
    }
    
    // Extract basic data
    const nazev = extractFirstValue(contract.predmet) || 
                  extractFirstValue(contract.nazev) || 
                  extractFirstValue(contract.popis) ||
                  'Neuvedeno';
    
    // Extract price info
    let castka = 0;
    if (contract.hodnotaBezDph) {
      castka = parseFloat(extractFirstValue(contract.hodnotaBezDph) || '0');
    } else if (contract.hodnotaVcetneDph) {
      castka = parseFloat(extractFirstValue(contract.hodnotaVcetneDph) || '0');
    } else if (contract.castka) {
      castka = parseFloat(extractFirstValue(contract.castka) || '0');
    }
    
          // Extract dates
    let datum = new Date();
    if (contract.datumUzavreni) {
      const dateStr = extractFirstValue(contract.datumUzavreni);
      if (dateStr) datum = new Date(dateStr);
    } else if (contract.datum) {
      const dateStr = extractFirstValue(contract.datum);
      if (dateStr) datum = new Date(dateStr);
    } else if (record.casZverejneni) {
      const dateStr = extractFirstValue(record.casZverejneni);
      if (dateStr) datum = new Date(dateStr);
    }
    
    // Get contract type
    const kategorie = extractFirstValue(contract.typSmlouvy) || 
                      extractFirstValue(contract.kategorie) || 
                      'ostatni';
    
    // Extract supplier information
    let dodavatel = 'Neuvedeno';
    if (contract.subjekt) {
      const suppliers = contract.subjekt.filter((s: any) => {
        if (!s.typ) return false;
        const typValue = extractFirstValue(s.typ);
        return typValue ? typValue.toLowerCase().includes('dodavatel') : false;
      });
      
      if (suppliers.length > 0) {
        dodavatel = extractFirstValue(suppliers[0].nazev) || 'Neuvedeno';
      }
    } else if (contract.dodavatel) {
      if (typeof contract.dodavatel[0] === 'object') {
        dodavatel = extractFirstValue(contract.dodavatel[0].nazev) || 'Neuvedeno';
      } else {
        dodavatel = extractFirstValue(contract.dodavatel) || 'Neuvedeno';
      }
    }
    
    // Extract contracting authority information
    let zadavatel = 'Neuvedeno';
    if (contract.subjekt) {
      const authorities = contract.subjekt.filter((s: any) => {
        if (!s.typ) return false;
        const typValue = extractFirstValue(s.typ);
        return typValue ? typValue.toLowerCase().includes('zadavatel') : false;
      });
      
      if (authorities.length > 0) {
        zadavatel = extractFirstValue(authorities[0].nazev) || 'Neuvedeno';
      }
    } else if (contract.zadavatel) {
      if (typeof contract.zadavatel[0] === 'object') {
        zadavatel = extractFirstValue(contract.zadavatel[0].nazev) || 'Neuvedeno';
      } else {
        zadavatel = extractFirstValue(contract.zadavatel) || 'Neuvedeno';
      }
    }
    
    // Get tender type
    const typ_rizeni = extractFirstValue(contract.druhRizeni) || 
                       extractFirstValue(contract.typ_rizeni) || 
                       'standardní';
    
    // Only return contracts with valid data
    if (nazev === 'Neuvedeno' && dodavatel === 'Neuvedeno' && zadavatel === 'Neuvedeno') {
      return null;
    }
    
    return {
      nazev,
      castka,
      kategorie,
      datum,
      dodavatel,
      zadavatel,
      typ_rizeni,
    };
  } catch (error) {
    console.error('Error transforming contract data:', error);
    return null;
  }
}

// Helper function to extract the first value from an array or return undefined
function extractFirstValue(value: any): string | undefined {
  if (!value) return undefined;
  
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    
    const firstItem = value[0];
    if (firstItem && typeof firstItem === 'object' && firstItem._) {
      // Handle case where value is an array of objects with "_" property
      return firstItem._.toString();
    }
    return firstItem?.toString();
  }
  
  // Handle case where value is an object with "_" property (common in XML parsing)
  if (typeof value === 'object' && value._) {
    return value._.toString();
  }
  
  return value?.toString();
}

// Function to geocode an address (simplified implementation)
async function geocodeAddress(address: string) {
  try {
    // Here you would normally call a geocoding service
    // For this example, we'll just return random coordinates in the Czech Republic
    return {
      lat: 49.8 + (Math.random() - 0.5) * 2,
      lng: 15.5 + (Math.random() - 0.5) * 4
    }
  } catch (error) {
    console.error(`Error geocoding address: ${address}`, error)
    return null
  }
}

// Check if tables exist and get exact table names
async function getExactTableNames(): Promise<Record<string, string>> {
  try {
    // Get all tables in the database
    const tables = await prisma.$queryRaw`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;
    
    console.log('Available tables in the database:', tables);
    
    // Create map of base table names to actual table names
    const tableMap: Record<string, string> = {};
    
    // Check for exact matches first
    const standardNames = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    for (const name of standardNames) {
      const exactMatch = (tables as any[]).find(t => t.tablename === name);
      if (exactMatch) {
        tableMap[name] = name;
      }
    }
    
    // Check for case-insensitive matches if exact matches weren't found
    for (const name of standardNames) {
      if (!tableMap[name]) {
        const insensitiveMatch = (tables as any[]).find(
          t => t.tablename.toLowerCase() === name.toLowerCase()
        );
        if (insensitiveMatch) {
          tableMap[name] = insensitiveMatch.tablename;
        }
      }
    }
    
    console.log('Table name mapping:', tableMap);
    return tableMap;
  } catch (error) {
    console.error('Error getting exact table names:', error);
    // Fall back to standard names if there's an error
    return {
      smlouva: 'smlouva',
      dodavatel: 'dodavatel',
      dodatek: 'dodatek',
      podnet: 'podnet'
    };
  }
}

// Main synchronization function
export async function syncData() {
  console.log('Starting data synchronization from open data dumps...')
  const startTime = Date.now()
  
  // Get exact table names
  const tableNames = await getExactTableNames();
  const smlouvaTable = tableNames.smlouva || 'smlouva';
  
  // Get the date of the last update - using updated_at from a Smlouva record
  let lastSync: Date;
  try {
    const lastSyncQuery = `SELECT updated_at FROM "${smlouvaTable}" ORDER BY updated_at DESC LIMIT 1`;
    const result = await prisma.$queryRawUnsafe(lastSyncQuery);
    lastSync = result[0]?.updated_at || new Date(0);
  } catch (error) {
    console.error('Error getting last sync date, using epoch:', error);
    lastSync = new Date(0);
  }
  
  console.log(`Last sync date: ${lastSync.toISOString()}`)
  
  // Calculate the months to download
  // We'll download the last 3 months of data
  const now = new Date()
  const months = []
  
  for (let i = 0; i < 3; i++) {
    const date = new Date(now)
    date.setMonth(now.getMonth() - i)
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1
    })
  }
  
  let processedCount = 0
  let newCount = 0
  let updatedCount = 0
  let errorCount = 0
  let skippedCount = 0
  
  // Process each month
  for (const { year, month } of months) {
    try {
      // Download and parse the XML dump
      const filePath = await downloadXmlDump(year, month)
      const records = await parseXmlDump(filePath)
      
      console.log(`Processing ${records.length} records for ${year}-${month}...`)
      
      // Process each record
      for (const record of records) {
        processedCount++
        
        try {
          // Transform the record data
          const contractData = transformContractData(record)
          
          // Skip invalid records
          if (!contractData) {
            skippedCount++;
            continue;
          }
          
          // Generate a unique identifier using contract attributes
          let contractId: string | undefined = undefined;
          
          // Try to extract the contract ID from the record
          if (record.identifikator) {
            contractId = extractFirstValue(record.identifikator);
          }
          
          // Check if the contract already exists by ID or attributes
          let existingContract;
          
          if (contractId) {
            // First try to find by attributes to check if it exists
            const findQuery = `
              SELECT id, lat, lng FROM "${smlouvaTable}" 
              WHERE nazev = $1 
                AND zadavatel = $2 
                AND dodavatel = $3 
                AND datum BETWEEN $4 AND $5
              LIMIT 1
            `;
            
            const params = [
              contractData.nazev,
              contractData.zadavatel,
              contractData.dodavatel,
              new Date(contractData.datum.getTime() - 24 * 60 * 60 * 1000),
              new Date(contractData.datum.getTime() + 24 * 60 * 60 * 1000)
            ];
            
            try {
              const result = await prisma.$queryRawUnsafe(findQuery, ...params);
              if (result && result.length > 0) {
                existingContract = result[0];
              }
            } catch (findError) {
              console.error('Error finding existing contract:', findError);
            }
          }
          
          // Add geolocation if we don't have it
          if (!existingContract?.lat || !existingContract?.lng) {
            let address;
            
            // Try to find the address from the record
            if (record.smlouva && record.smlouva[0] && record.smlouva[0].subjekt) {
              const authorities = record.smlouva[0].subjekt.filter((s: any) => {
                if (!s.typ) return false;
                const typValue = extractFirstValue(s.typ);
                return typValue ? typValue.toLowerCase().includes('zadavatel') : false;
              });
              
              if (authorities.length > 0 && authorities[0].adresa) {
                address = extractFirstValue(authorities[0].adresa);
              }
            }
            
            if (!address && record.smlouva && record.smlouva[0]?.zadavatel?.[0]?.adresa) {
              address = extractFirstValue(record.smlouva[0].zadavatel[0].adresa);
            }
            
            if (address) {
              const geoData = await geocodeAddress(address);
              if (geoData) {
                contractData.lat = geoData.lat;
                contractData.lng = geoData.lng;
              }
            }
          }
          
          // Create or update the contract using raw queries
          if (existingContract) {
            const updateQuery = `
              UPDATE "${smlouvaTable}" SET
                nazev = $1,
                castka = $2,
                kategorie = $3,
                datum = $4,
                dodavatel = $5,
                zadavatel = $6,
                typ_rizeni = $7,
                lat = $8,
                lng = $9,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $10
            `;
            
            const updateParams = [
              contractData.nazev,
              contractData.castka,
              contractData.kategorie,
              contractData.datum,
              contractData.dodavatel,
              contractData.zadavatel,
              contractData.typ_rizeni,
              contractData.lat || null,
              contractData.lng || null,
              existingContract.id
            ];
            
            await prisma.$executeRawUnsafe(updateQuery, ...updateParams);
            updatedCount++;
          } else {
            const insertQuery = `
              INSERT INTO "${smlouvaTable}" (
                nazev, castka, kategorie, datum, dodavatel, zadavatel, 
                typ_rizeni, lat, lng, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
              )
            `;
            
            const insertParams = [
              contractData.nazev,
              contractData.castka,
              contractData.kategorie,
              contractData.datum,
              contractData.dodavatel,
              contractData.zadavatel,
              contractData.typ_rizeni,
              contractData.lat || null,
              contractData.lng || null
            ];
            
            await prisma.$executeRawUnsafe(insertQuery, ...insertParams);
            newCount++;
          }
          
          // Log progress for every 100 contracts
          if (processedCount % 100 === 0) {
            console.log(`Processed ${processedCount} records (${newCount} new, ${updatedCount} updated, ${skippedCount} skipped)`);
          }
        } catch (itemError) {
          console.error(`Error processing record:`, itemError);
          errorCount++;
          // Continue with the next record
          continue;
        }
      }
      
      // Delay between processing months to avoid system overload
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error processing data for ${year}-${month}:`, error);
      errorCount++;
      // Continue with the next month
      continue;
    }
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  const summary = {
    duration: `${duration} seconds`,
    processed: processedCount,
    new: newCount,
    updated: updatedCount,
    skipped: skippedCount,
    errors: errorCount
  };
  
  console.log(`Synchronization completed in ${duration} seconds`);
  console.log(`Processed ${processedCount} records, added ${newCount} new, updated ${updatedCount}, skipped ${skippedCount}, errors: ${errorCount}`);
  
  return summary;
}

// Run directly if this script is executed directly
if (require.main === module) {
  syncData()
    .then(() => {
      console.log('Data sync completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Data sync failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
