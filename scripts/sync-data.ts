import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import xml2js from 'xml2js'
import { PrismaClient } from '@prisma/client'
import os from 'os'

// Configuration options
const CONFIG = {
  // Processing batch sizes
  BATCH_SIZES: {
    CONTRACTS: 100,    // Process 100 contracts per batch
    SUPPLIERS: 20,     // Process 20 suppliers per extraction batch
    AMENDMENTS: 10     // Create amendments for 10 contracts per batch
  },
  
  // Safe-point file
  SAFE_POINT_FILE: path.join(os.tmpdir(), 'sync-safepoint.json'),
  
  // Number of months to process
  MONTHS_TO_PROCESS: 3,
  
  // Enable/disable phases (useful for debugging)
  PHASES: {
    IMPORT_CONTRACTS: true,
    EXTRACT_SUPPLIERS: true,
    CREATE_AMENDMENTS: true
  },
  
  // Debug levels
  DEBUG: process.env.DEBUG === 'true',
  
  // Force flags
  FORCE_RESET_SAFEPOINT: process.env.FORCE_RESET_SAFEPOINT === 'true',
  FORCE_EXTRACT_SUPPLIERS: process.env.FORCE_EXTRACT_SUPPLIERS === 'true',
  FORCE_CREATE_AMENDMENTS: process.env.FORCE_CREATE_AMENDMENTS === 'true'
}

// Vytvoření nové instance PrismaClient 
// s doporučeným nastavením pro konzolové aplikace
const prisma = new PrismaClient({
  log: CONFIG.DEBUG ? ['query', 'info', 'error', 'warn'] : ['error', 'warn'],
})

console.log('Using PrismaClient with connection:', process.env.DATABASE_URL || 'default connection');
console.log('DEBUG mode:', CONFIG.DEBUG ? 'enabled' : 'disabled');
console.log('Force reset safepoint:', CONFIG.FORCE_RESET_SAFEPOINT ? 'enabled' : 'disabled');

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
  dodavatel_ico?: string;
  zadavatel: string;
  zadavatel_adresa?: string;
  typ_rizeni: string;
  external_id?: string;
  lat?: number;
  lng?: number;
}

// Interface for safe-point tracking
interface SafePoint {
  lastUpdated: string;
  processedMonths: Array<{year: number, month: number, completed: boolean}>;
  currentMonth: {year: number, month: number} | null;
  currentBatch: number;
  totalRecords: number;
  processedRecords: number;
  newContracts: number;
  updatedContracts: number;
  skippedContracts: number;
  errorContracts: number;
  extractedSuppliers: number;
  createdAmendments: number;
  errors: string[];
  isComplete: boolean;
  collectedContractIds: number[];
}

// Initialize safe-point 
function initSafePoint(): SafePoint {
  return {
    lastUpdated: new Date().toISOString(),
    processedMonths: [],
    currentMonth: null,
    currentBatch: 0,
    totalRecords: 0,
    processedRecords: 0,
    newContracts: 0,
    updatedContracts: 0,
    skippedContracts: 0,
    errorContracts: 0,
    extractedSuppliers: 0,
    createdAmendments: 0,
    errors: [],
    isComplete: false,
    collectedContractIds: []
  };
}

// Load safe-point from file
function loadSafePoint(): SafePoint {
  try {
    if (fs.existsSync(CONFIG.SAFE_POINT_FILE) && !CONFIG.FORCE_RESET_SAFEPOINT) {
      const data = fs.readFileSync(CONFIG.SAFE_POINT_FILE, 'utf8');
      console.log('Loading safe-point from file:', CONFIG.SAFE_POINT_FILE);
      
      const safePoint = JSON.parse(data) as SafePoint;
      
      // Ensure we have collectedContractIds property (might be missing in older safe-points)
      if (!safePoint.collectedContractIds) {
        safePoint.collectedContractIds = [];
      }
      
      return safePoint;
    }
  } catch (error) {
    console.error('Error loading safe-point:', error);
  }
  
  // If file doesn't exist or there's an error, create a new safe-point
  console.log('Creating new safe-point');
  return initSafePoint();
}

// Save safe-point to file
function saveSafePoint(safePoint: SafePoint) {
  try {
    // Update the timestamp
    safePoint.lastUpdated = new Date().toISOString();
    
    // Save to file
    fs.writeFileSync(CONFIG.SAFE_POINT_FILE, JSON.stringify(safePoint, null, 2));
    if (CONFIG.DEBUG) {
      console.log('Safe-point saved:', CONFIG.SAFE_POINT_FILE);
    }
  } catch (error) {
    console.error('Error saving safe-point:', error);
  }
}

// Function to run diagnostic checks on database tables
async function diagnosticCheck(tableNames: Record<string, string>) {
  try {
    console.log('======= RUNNING DIAGNOSTIC CHECKS =======');
    
    // Check smlouva table
    const smlouvaTable = tableNames.smlouva || 'smlouva';
    try {
      // Check if table exists
      await prisma.$executeRawUnsafe(`SELECT 1 FROM "${smlouvaTable}" LIMIT 1`);
      console.log(`✓ Table ${smlouvaTable} exists`);
      
      // Count records
      const countResult = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${smlouvaTable}"`);
      const count = Array.isArray(countResult) && countResult.length > 0 ? countResult[0].count : 0;
      console.log(`✓ Table ${smlouvaTable} has ${count} records`);
      
      // Check for suppliers
      const supplierQuery = `
        SELECT COUNT(DISTINCT dodavatel) as count 
        FROM "${smlouvaTable}" 
        WHERE dodavatel IS NOT NULL AND dodavatel != 'Neuvedeno'
      `;
      const supplierResult = await prisma.$queryRawUnsafe(supplierQuery);
      const supplierCount = Array.isArray(supplierResult) && supplierResult.length > 0 ? supplierResult[0].count : 0;
      console.log(`✓ Found ${supplierCount} unique suppliers in contracts`);
      
      // Sample some suppliers
      const sampleQuery = `
        SELECT DISTINCT dodavatel 
        FROM "${smlouvaTable}" 
        WHERE dodavatel IS NOT NULL AND dodavatel != 'Neuvedeno' 
        LIMIT 5
      `;
      const samples = await prisma.$queryRawUnsafe(sampleQuery);
      console.log('Sample suppliers:', samples);
    } catch (e) {
      console.error(`✗ Error checking ${smlouvaTable} table:`, e);
    }
    
    // Check dodavatel table
    const dodavatelTable = tableNames.dodavatel || 'dodavatel';
    try {
      // Check if table exists
      await prisma.$executeRawUnsafe(`SELECT 1 FROM "${dodavatelTable}" LIMIT 1`);
      console.log(`✓ Table ${dodavatelTable} exists`);
      
      // Count records
      const countResult = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${dodavatelTable}"`);
      const count = Array.isArray(countResult) && countResult.length > 0 ? countResult[0].count : 0;
      console.log(`✓ Table ${dodavatelTable} has ${count} records`);
      
      // Sample some records
      if (count > 0) {
        const sampleQuery = `SELECT * FROM "${dodavatelTable}" LIMIT 3`;
        const samples = await prisma.$queryRawUnsafe(sampleQuery);
        console.log('Sample dodavatel records:', samples);
      }
    } catch (e) {
      console.log(`✗ Table ${dodavatelTable} does not exist or cannot be accessed`);
    }
    
    // Check dodatek table
    const dodatekTable = tableNames.dodatek || 'dodatek';
    try {
      // Check if table exists
      await prisma.$executeRawUnsafe(`SELECT 1 FROM "${dodatekTable}" LIMIT 1`);
      console.log(`✓ Table ${dodatekTable} exists`);
      
      // Count records
      const countResult = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${dodatekTable}"`);
      const count = Array.isArray(countResult) && countResult.length > 0 ? countResult[0].count : 0;
      console.log(`✓ Table ${dodatekTable} has ${count} records`);
      
      // Sample some records
      if (count > 0) {
        const sampleQuery = `SELECT * FROM "${dodatekTable}" LIMIT 3`;
        const samples = await prisma.$queryRawUnsafe(sampleQuery);
        console.log('Sample dodatek records:', samples);
      }
    } catch (e) {
      console.log(`✗ Table ${dodatekTable} does not exist or cannot be accessed`);
    }
    
    console.log('======= DIAGNOSTIC CHECKS COMPLETE =======');
  } catch (e) {
    console.error('Error during diagnostic checks:', e);
  }
}

// Function to download XML dump for a specific month
async function downloadXmlDump(year: number, month: number): Promise<string> {
  // Format month as two digits
  const monthFormatted = month.toString().padStart(2, '0')
  const fileName = `dump_${year}_${monthFormatted}.xml`
  const url = `https://data.smlouvy.gov.cz/${fileName}`
  
  console.log(`Downloading data dump from: ${url}`)
  
  try {
    // Check if file already exists
    const filePath = path.join(TEMP_DIR, fileName)
    if (fs.existsSync(filePath)) {
      console.log(`File already exists at: ${filePath}, skipping download`)
      return filePath
    }
    
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`)
    }
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true })
    }
    
    // Save the file
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

// Function to extract the first value from an array or return undefined
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

// Function to recursively search for a key in an object
function findKeyInObject(obj: any, targetKey: string, maxDepth = 3, currentDepth = 0): any[] {
  if (!obj || typeof obj !== 'object' || currentDepth > maxDepth) return [];
  
  let results: any[] = [];
  
  for (const key in obj) {
    if (key === targetKey) {
      results.push(obj[key]);
    } else if (typeof obj[key] === 'object') {
      const nestedResults = findKeyInObject(obj[key], targetKey, maxDepth, currentDepth + 1);
      results = results.concat(nestedResults);
    }
  }
  
  return results;
}

// DEBUG: Function to dump object structure
function dumpObjectStructure(obj: any, maxDepth = 3, currentDepth = 0, prefix = ''): string {
  if (!obj || typeof obj !== 'object' || currentDepth > maxDepth) {
    return prefix + (typeof obj === 'object' ? '[Object]' : String(obj)) + '\n';
  }
  
  let result = '';
  
  for (const key in obj) {
    const value = obj[key];
    if (value === null) {
      result += `${prefix}${key}: null\n`;
    } else if (typeof value === 'object') {
      if (Array.isArray(value)) {
        result += `${prefix}${key}: [Array(${value.length})]\n`;
        if (value.length > 0 && currentDepth < maxDepth) {
          result += dumpObjectStructure(value[0], maxDepth, currentDepth + 1, prefix + '  ');
        }
      } else {
        result += `${prefix}${key}: {Object}\n`;
        if (currentDepth < maxDepth) {
          result += dumpObjectStructure(value, maxDepth, currentDepth + 1, prefix + '  ');
        }
      }
    } else {
      result += `${prefix}${key}: ${value}\n`;
    }
  }
  
  return result;
}

// Function for geocoding using Nominatim API 
async function geocodeAddress(address: string | null, zadavatel: string | null): Promise<{ lat: number, lng: number } | null> {
  try {
    // If we have no address or authority name, we can't geocode
    if (!address && !zadavatel) {
      if (CONFIG.DEBUG) console.log('Geocoding: No address or authority provided');
      return null;
    }

    // Prioritize address for geocoding
    let searchQuery = '';
    
    if (address) {
      searchQuery = `${address}, Česká republika`;
      if (CONFIG.DEBUG) console.log(`Geocoding using address: "${address}"`);
    } else if (zadavatel) {
      searchQuery = `${zadavatel}, Česká republika`;
      if (CONFIG.DEBUG) console.log(`Geocoding using authority: "${zadavatel}"`);
    }
    
    // Add delay to respect Nominatim API limits
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Call Nominatim API
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&countrycodes=cz`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DanovyHlidac/1.0 (https://danovyhlidac.cz; info@danovyhlidac.cz)',
        'Accept-Language': 'cs,en',
        'From': 'info@danovyhlidac.cz'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Nominatim API responded with status: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      const result = data[0];
      
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      };
    }
    
    // If no results, return null
    return null;
  } catch (error) {
    console.error(`Geocoding error:`, error);
    return null;
  }
}

// Function to ensure the database has the necessary columns
async function ensureDatabaseSchema(tableNames: Record<string, string>) {
  try {
    console.log('Checking database schema...');
    const smlouvaTable = tableNames.smlouva || 'smlouva';
    
    // Check if the table exists
    try {
      await prisma.$executeRawUnsafe(`SELECT 1 FROM "${smlouvaTable}" LIMIT 1`);
      console.log(`Table ${smlouvaTable} exists`);
    } catch (e) {
      console.error(`Table ${smlouvaTable} not found:`, e);
      return;
    }
    
    // Check if the columns exist
    const columnsToCheck = ['dodavatel_ico', 'zadavatel_adresa'];
    const columnsToAdd = [];
    
    for (const column of columnsToCheck) {
      try {
        // Check if the column exists
        const checkQuery = `
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = '${smlouvaTable}' 
          AND column_name = '${column}'
        `;
        
        const result = await prisma.$queryRawUnsafe(checkQuery);
        const exists = Array.isArray(result) && result.length > 0;
        
        if (!exists) {
          columnsToAdd.push(column);
        }
      } catch (e) {
        console.error(`Error checking column ${column}:`, e);
      }
    }
    
    // Add missing columns
    if (columnsToAdd.length > 0) {
      console.log(`Adding missing columns to ${smlouvaTable}: ${columnsToAdd.join(', ')}`);
      
      for (const column of columnsToAdd) {
        try {
          const alterQuery = `ALTER TABLE "${smlouvaTable}" ADD COLUMN IF NOT EXISTS "${column}" TEXT`;
          await prisma.$executeRawUnsafe(alterQuery);
          console.log(`Added column ${column}`);
        } catch (e) {
          console.error(`Error adding column ${column}:`, e);
        }
      }
    } else {
      console.log('All required columns already exist');
    }
  } catch (e) {
    console.error('Error checking database schema:', e);
  }
}

// Transform XML data to database format with enhanced debug mode
function transformContractData(record: any): ContractData | null {
  try {
    // Check if this is a 'zaznam' record with smlouva inside
    const contract = record.smlouva ? record.smlouva[0] : record;
    
    if (CONFIG.DEBUG) {
      console.log('\n=== CONTRACT DATA DEBUG ===');
      console.log('Record keys:', Object.keys(record));
      console.log('Contract keys:', Object.keys(contract));
      
      // Dump structure of identifikator if it exists
      if (record.identifikator) {
        console.log('\nRECORD IDENTIFIKATOR STRUCTURE:');
        console.log(dumpObjectStructure(record.identifikator));
      }
      
      if (contract.identifikator) {
        console.log('\nCONTRACT IDENTIFIKATOR STRUCTURE:');
        console.log(dumpObjectStructure(contract.identifikator));
      }
      
      // Search for idVerze in the entire object
      console.log('\nSEARCHING FOR idVerze IN RECORD:');
      const idVerzeInRecord = findKeyInObject(record, 'idVerze');
      console.log('Found idVerze in record:', idVerzeInRecord);
      
      console.log('\nSEARCHING FOR idVerze IN CONTRACT:');
      const idVerzeInContract = findKeyInObject(contract, 'idVerze');
      console.log('Found idVerze in contract:', idVerzeInContract);
      
      // Search for related fields
      console.log('\nADDITIONAL ID FIELDS SEARCH:');
      const idSmlouvyFields = findKeyInObject(record, 'idSmlouvy');
      console.log('idSmlouvy fields found:', idSmlouvyFields);
      
      const externalIdFields = findKeyInObject(record, 'externalId');
      console.log('externalId fields found:', externalIdFields);
      
      const cisloFields = findKeyInObject(record, 'cislo');
      console.log('cislo fields found:', cisloFields);
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
    
    // ENHANCED EXTERNAL ID EXTRACTION WITH EXHAUSTIVE SEARCH
    let externalId: string | undefined = undefined;
    
    // Debug the structure to help diagnose issues
    if (CONFIG.DEBUG) {
      console.log('\n=== EXTERNAL ID EXTRACTION ===');
    }
    
    // Try all possible locations for idVerze
    if (record.identifikator && record.identifikator.idVerze) {
      externalId = extractFirstValue(record.identifikator.idVerze);
      if (CONFIG.DEBUG) console.log(`1. Found idVerze in record.identifikator.idVerze: ${externalId}`);
    }
    else if (record.idVerze) {
      externalId = extractFirstValue(record.idVerze);
      if (CONFIG.DEBUG) console.log(`2. Found idVerze directly in record: ${externalId}`);
    }
    else if (contract.idVerze) {
      externalId = extractFirstValue(contract.idVerze);
      if (CONFIG.DEBUG) console.log(`3. Found idVerze in contract: ${externalId}`);
    }
    else if (contract.identifikator && contract.identifikator.idVerze) {
      externalId = extractFirstValue(contract.identifikator.idVerze);
      if (CONFIG.DEBUG) console.log(`4. Found idVerze in contract.identifikator.idVerze: ${externalId}`);
    }
    // Try additional places that might contain identifiers
    else if (record.identifikator && record.identifikator.idSmlouvy) {
      externalId = extractFirstValue(record.identifikator.idSmlouvy);
      if (CONFIG.DEBUG) console.log(`5. Using idSmlouvy from record.identifikator: ${externalId}`);
    }
    else if (contract.identifikator && contract.identifikator.idSmlouvy) {
      externalId = extractFirstValue(contract.identifikator.idSmlouvy);
      if (CONFIG.DEBUG) console.log(`6. Using idSmlouvy from contract.identifikator: ${externalId}`);
    }
    else if (record.cislo) {
      externalId = extractFirstValue(record.cislo);
      if (CONFIG.DEBUG) console.log(`7. Using cislo from record: ${externalId}`);
    }
    else if (contract.cislo) {
      externalId = extractFirstValue(contract.cislo);
      if (CONFIG.DEBUG) console.log(`8. Using cislo from contract: ${externalId}`);
    }
    else if (record.id) {
      externalId = extractFirstValue(record.id);
      if (CONFIG.DEBUG) console.log(`9. Using direct record.id: ${externalId}`);
    }
    
    // Use recursive search to find any idVerze in any location if still not found
    if (!externalId) {
      const allIdVerze = findKeyInObject(record, 'idVerze');
      if (allIdVerze.length > 0) {
        externalId = extractFirstValue(allIdVerze[0]);
        if (CONFIG.DEBUG) console.log(`10. Found idVerze through deep search: ${externalId}`);
      } else {
        // Try finding idSmlouvy if idVerze not found
        const allIdSmlouvy = findKeyInObject(record, 'idSmlouvy');
        if (allIdSmlouvy.length > 0) {
          externalId = extractFirstValue(allIdSmlouvy[0]);
          if (CONFIG.DEBUG) console.log(`11. Found idSmlouvy through deep search: ${externalId}`);
        }
      }
    }
    
    // If no ID was found and DEBUG is enabled, dump some data to help diagnose
    if (!externalId && CONFIG.DEBUG) {
      console.log('WARNING: No external ID found for contract. Record summary:');
      // Print a summary of the record structure to help diagnose
      if (record.identifikator) {
        console.log('record.identifikator:', JSON.stringify(record.identifikator));
      }
      if (contract.identifikator) {
        console.log('contract.identifikator:', JSON.stringify(contract.identifikator));
      }
      // Look for any field that might contain an ID
      console.log('Looking for any ID-like fields in record...');
      for (const key of Object.keys(record)) {
        if (key.toLowerCase().includes('id') || key.toLowerCase().includes('cislo')) {
          console.log(`Found potential ID field ${key}:`, record[key]);
        }
      }
      for (const key of Object.keys(contract)) {
        if (key.toLowerCase().includes('id') || key.toLowerCase().includes('cislo')) {
          console.log(`Found potential ID field ${key}:`, contract[key]);
        }
      }
    }
    
    // Direct extraction of parties from XML structure
    let zadavatel = 'Neuvedeno';
    let zadavatelAdresa: string | undefined = undefined;
    let dodavatel = 'Neuvedeno';
    let dodavatelIco: string | undefined = undefined;
    
    // Extract client/authority from subjekt element
    if (contract.subjekt && Array.isArray(contract.subjekt) && contract.subjekt.length > 0) {
      const client = contract.subjekt[0];
      zadavatel = extractFirstValue(client.nazev) || 'Neuvedeno';
      zadavatelAdresa = extractFirstValue(client.adresa);
      
      if (CONFIG.DEBUG) {
        console.log(`From subjekt - Zadavatel: ${zadavatel}`);
        console.log(`From subjekt - Adresa: ${zadavatelAdresa || 'undefined'}`);
      }
    }
    
    // Extract contractor from smluvniStrana element
    if (contract.smluvniStrana && Array.isArray(contract.smluvniStrana) && contract.smluvniStrana.length > 0) {
      const contractor = contract.smluvniStrana[0];
      dodavatel = extractFirstValue(contractor.nazev) || 'Neuvedeno';
      dodavatelIco = extractFirstValue(contractor.ico);
      
      if (CONFIG.DEBUG) {
        console.log(`From smluvniStrana - Dodavatel: ${dodavatel}`);
        console.log(`From smluvniStrana - ICO: ${dodavatelIco || 'undefined'}`);
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
    
    // Final result with all extracted data
    const result = {
      nazev,
      castka,
      kategorie,
      datum,
      dodavatel,
      dodavatel_ico: dodavatelIco,
      zadavatel,
      zadavatel_adresa: zadavatelAdresa,
      typ_rizeni,
      external_id: externalId, // This should now be properly extracted
      lat: undefined,
      lng: undefined,
    };
    
    if (CONFIG.DEBUG) {
      console.log('\n=== EXTRACTED RESULT ===');
      console.log('external_id:', result.external_id);
      console.log('=======================\n');
    }
    
    return result;
  } catch (error) {
    console.error('Error transforming contract data:', error);
    return null;
  }
}

// Function to process a batch of contracts and insert/update them in the database
async function processContractBatch(
  records: any[], 
  startIndex: number, 
  batchSize: number, 
  smlouvaTable: string,
  safePoint: SafePoint
): Promise<{
  newCount: number,
  updatedCount: number,
  skippedCount: number,
  errorCount: number,
  contractIds: number[]
}> {
  console.log(`\n=== Processing batch of ${Math.min(batchSize, records.length - startIndex)} contracts (${startIndex+1}-${Math.min(startIndex+batchSize, records.length)}) ===`);
  
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const contractIds: number[] = [];
  
  const endIndex = Math.min(startIndex + batchSize, records.length);
  
  for (let i = startIndex; i < endIndex; i++) {
    const record = records[i];
    
    try {
      // Log progress
      if ((i + 1) % 10 === 0 || i === startIndex) {
        console.log(`Processing record ${i+1}/${records.length} (${Math.round((i+1)/records.length*100)}%)`);
      }
      
      // Transform the record data
      const contractData = transformContractData(record);
      
      // Skip invalid records
      if (!contractData) {
        skippedCount++;
        safePoint.skippedContracts++;
        continue;
      }
      
      // Add debug log for external_id
      if (CONFIG.DEBUG) {
        console.log(`Processing contract with external_id: ${contractData.external_id || 'null'}`);
      }
      
      // Check if the contract already exists by external ID or attributes
      let existingContract: { id: number, lat?: number, lng?: number } | null = null;
      
      if (contractData.external_id) {
        // First try to find by external ID
        const findByIdQuery = `
          SELECT id, lat, lng FROM "${smlouvaTable}" 
          WHERE external_id = $1
          LIMIT 1
        `;
        
        try {
          const result = await prisma.$queryRawUnsafe(findByIdQuery, contractData.external_id);
          const resultArray = result as Array<{ id: number, lat?: number, lng?: number }>;
          if (resultArray.length > 0) {
            existingContract = resultArray[0];
          }
        } catch (findError) {
          console.error(`Error finding existing contract by ID:`, findError);
        }
      }
      
      // If not found by ID, try to find by attributes
      if (!existingContract) {
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
          const resultArray = result as Array<{ id: number, lat?: number, lng?: number }>;
          if (resultArray.length > 0) {
            existingContract = resultArray[0];
          }
        } catch (findError) {
          console.error(`Error finding existing contract by attributes:`, findError);
        }
      }
      
      // Add geolocation if we don't have it
      if (!existingContract?.lat || !existingContract?.lng) {
        try {
          const geoData = await geocodeAddress(contractData.zadavatel_adresa || null, contractData.zadavatel);
          if (geoData) {
            contractData.lat = geoData.lat;
            contractData.lng = geoData.lng;
          }
        } catch (geoError) {
          console.error(`Error geocoding for contract:`, geoError);
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
            dodavatel_ico = $6,
            zadavatel = $7,
            zadavatel_adresa = $8,
            typ_rizeni = $9,
            external_id = CASE WHEN $10::text IS NULL THEN external_id ELSE $10::text END,
            lat = CASE WHEN $11::text = 'null' THEN NULL ELSE $11::double precision END,
            lng = CASE WHEN $12::text = 'null' THEN NULL ELSE $12::double precision END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $13
          RETURNING id
        `;

        const updateParams = [
          contractData.nazev,
          contractData.castka,
          contractData.kategorie,
          contractData.datum,
          contractData.dodavatel,
          contractData.dodavatel_ico || null,
          contractData.zadavatel,
          contractData.zadavatel_adresa || null,
          contractData.typ_rizeni,
          contractData.external_id || null,
          typeof contractData.lat === 'number' ? contractData.lat : null,
          typeof contractData.lng === 'number' ? contractData.lng : null,
          existingContract.id
        ];
        
        try {
          const updateResult = await prisma.$queryRawUnsafe(updateQuery, ...updateParams);
          updatedCount++;
          safePoint.updatedContracts++;
          
          // Log successful update for debugging
          if (CONFIG.DEBUG) {
            console.log(`Updated contract ID: ${existingContract.id}, external_id: ${contractData.external_id || 'null'}`);
          }
          
          // Add the contract ID to the list for supplier extraction
          if (Array.isArray(updateResult) && updateResult.length > 0) {
            contractIds.push(updateResult[0].id);
            
            // Also add to safe point
            if (!safePoint.collectedContractIds.includes(updateResult[0].id)) {
              safePoint.collectedContractIds.push(updateResult[0].id);
            }
          } else {
            // If no ID returned, use the known ID
            contractIds.push(existingContract.id);
            
            // Also add to safe point
            if (!safePoint.collectedContractIds.includes(existingContract.id)) {
              safePoint.collectedContractIds.push(existingContract.id);
            }
          }
        } catch (updateError) {
          console.error(`Error updating contract:`, updateError);
          errorCount++;
          safePoint.errorContracts++;
        }
      } else {
        const insertQuery = `
          INSERT INTO "${smlouvaTable}" (
            nazev, castka, kategorie, datum, dodavatel, dodavatel_ico,
            zadavatel, zadavatel_adresa, typ_rizeni, external_id, lat, lng, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
            CASE WHEN $11::text = 'null' THEN NULL ELSE $11::double precision END,
            CASE WHEN $12::text = 'null' THEN NULL ELSE $12::double precision END,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          RETURNING id
        `;
        
        const insertParams = [
          contractData.nazev,
          contractData.castka,
          contractData.kategorie,
          contractData.datum,
          contractData.dodavatel,
          contractData.dodavatel_ico || null,
          contractData.zadavatel,
          contractData.zadavatel_adresa || null,
          contractData.typ_rizeni,
          contractData.external_id || null,
          typeof contractData.lat === 'number' ? contractData.lat : null,
          typeof contractData.lng === 'number' ? contractData.lng : null,
        ];
        
        try {
          const insertResult = await prisma.$queryRawUnsafe(insertQuery, ...insertParams);
          newCount++;
          safePoint.newContracts++;
          
          // Log successful insert for debugging
          if (CONFIG.DEBUG) {
            console.log(`Inserted new contract with external_id: ${contractData.external_id || 'null'}`);
          }
          
          // Add the contract ID to the list for supplier extraction
          if (Array.isArray(insertResult) && insertResult.length > 0) {
            contractIds.push(insertResult[0].id);
            
            // Also add to safe point
            if (!safePoint.collectedContractIds.includes(insertResult[0].id)) {
              safePoint.collectedContractIds.push(insertResult[0].id);
            }
            
            if (CONFIG.DEBUG) {
              console.log(`Inserted new contract ID: ${insertResult[0].id}`);
            }
          }
        } catch (insertError) {
          console.error(`Error inserting contract:`, insertError);
          errorCount++;
          safePoint.errorContracts++;
        }
      }
    } catch (itemError) {
      console.error(`Error processing record:`, itemError);
      errorCount++;
      safePoint.errorContracts++;
      continue;
    }
  }
  
  console.log(`Batch processing complete: ${newCount} new, ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`);
  console.log(`Collected ${contractIds.length} contract IDs in this batch`);
  
  safePoint.processedRecords += (endIndex - startIndex);
  
  // Save the safe point after batch processing
  saveSafePoint(safePoint);
  
  // Return the results of this batch
  return {
    newCount,
    updatedCount,
    skippedCount,
    errorCount,
    contractIds
  };
}

// Function to extract suppliers from contracts
async function extractSuppliersFromBatch(tableNames: Record<string, string>, contractIds: number[]) {
  console.log(`\n=== Extracting suppliers from ${contractIds.length} contracts ===`);
  
  const smlouvaTable = tableNames.smlouva || 'smlouva';
  const dodavatelTable = tableNames.dodavatel || 'dodavatel';
  let insertedCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  
  try {
    // 1. Ensures the dodavatel table exists
    try {
      console.log(`Checking if ${dodavatelTable} table exists...`);
      
      // Check if table exists
      try {
        await prisma.$executeRawUnsafe(`SELECT 1 FROM "${dodavatelTable}" LIMIT 1`);
        console.log(`✓ Table ${dodavatelTable} exists`);
      } catch (e) {
        console.log(`Creating table ${dodavatelTable} as it does not exist...`);
        
        // Create the table
        const createTableQuery = `
          CREATE TABLE IF NOT EXISTS "${dodavatelTable}" (
            "nazev" TEXT PRIMARY KEY,
            "ico" TEXT UNIQUE,
            "datum_zalozeni" TIMESTAMP(3),
            "pocet_zamestnancu" INTEGER,
            "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
          )
        `;
        
        await prisma.$executeRawUnsafe(createTableQuery);
        console.log(`Table ${dodavatelTable} created successfully`);
      }
    } catch (e) {
      console.error(`CRITICAL ERROR: Failed to ensure ${dodavatelTable} table exists:`, e);
      return { 
        inserted: 0, 
        skipped: 0,
        updated: 0,
        error: true, 
        message: `Failed to ensure ${dodavatelTable} table exists: ${e instanceof Error ? e.message : String(e)}` 
      };
    }
    
    // Get contract IDs if none provided - this ensures we create suppliers even if no new contracts were processed
    let idsToUse = contractIds;
    
    // Check if we need to use a fallback for contract IDs
    if (contractIds.length === 0 || CONFIG.FORCE_EXTRACT_SUPPLIERS) {
      console.log(contractIds.length === 0 ? 
        'No contract IDs provided, fetching contracts from database...' : 
        'Force extracting suppliers from all contracts in database...');
      
      try {
        // Get some contract IDs from the database to ensure we create suppliers
        const idQuery = `
          SELECT id FROM "${smlouvaTable}" 
          WHERE dodavatel IS NOT NULL AND dodavatel != 'Neuvedeno'
          ORDER BY id DESC
          LIMIT 100
        `;
        
        const idResult = await prisma.$queryRawUnsafe(idQuery);
        const dbIds = Array.isArray(idResult) ? idResult.map((r: any) => r.id) : [];
        
        if (dbIds.length > 0) {
          console.log(`Found ${dbIds.length} contract IDs in database to extract suppliers from`);
          idsToUse = dbIds;
        } else {
          console.log('No suitable contracts found in database');
          return { inserted: 0, skipped: 0, updated: 0, errors: 0 };
        }
      } catch (e) {
        console.error('Error fetching contract IDs from database:', e);
        return { inserted: 0, skipped: 0, updated: 0, errors: 0 };
      }
    }
    
    // If we still have no IDs, skip
    if (idsToUse.length === 0) {
      console.log('No contract IDs available for supplier extraction');
      return { inserted: 0, skipped: 0, updated: 0, errors: 0 };
    }
    
    console.log(`Using ${idsToUse.length} contract IDs for supplier extraction`);
    
    // 2. Get unique suppliers from the specified contracts
    console.log(`Fetching suppliers from specified contracts...`);
    const supplierQuery = `
      SELECT DISTINCT dodavatel, dodavatel_ico 
      FROM "${smlouvaTable}" 
      WHERE id IN (${idsToUse.join(',')})
        AND dodavatel IS NOT NULL 
        AND dodavatel != 'Neuvedeno'
    `;
    
    let suppliers: any[];
    try {
      suppliers = await prisma.$queryRawUnsafe(supplierQuery) as any[];
      console.log(`Found ${suppliers.length} unique suppliers in the specified contracts`);
    } catch (e) {
      console.error(`Error fetching suppliers from contracts:`, e);
      return { 
        inserted: 0, 
        skipped: 0, 
        updated: 0,
        error: true, 
        message: `Error fetching suppliers: ${e instanceof Error ? e.message : String(e)}` 
      };
    }
    
    // 3. Process suppliers
    const batchSize = CONFIG.BATCH_SIZES.SUPPLIERS;
    
    for (let i = 0; i < suppliers.length; i += batchSize) {
      const batch = suppliers.slice(i, i + batchSize);
      console.log(`Processing supplier batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(suppliers.length/batchSize)} (${i+1}-${Math.min(i+batchSize, suppliers.length)} of ${suppliers.length})`);
      
      let batchInserted = 0;
      let batchSkipped = 0;
      let batchUpdated = 0;
      let batchErrors = 0;
      
      for (const supplier of batch) {
        const supplierName = supplier.dodavatel;
        const supplierIco = supplier.dodavatel_ico;
        
        if (!supplierName || supplierName === 'Neuvedeno') {
          skippedCount++;
          batchSkipped++;
          continue;
        }
        
        try {
          // Enhanced check: Check if supplier already exists by name OR by ICO
          let existingSupplier = null;
          let existsBy = '';
          
          // Check by name first
          const checkByNameQuery = `
            SELECT nazev, ico FROM "${dodavatelTable}" 
            WHERE nazev = $1
            LIMIT 1
          `;
          
          const nameResult = await prisma.$queryRawUnsafe(checkByNameQuery, supplierName);
          if (Array.isArray(nameResult) && nameResult.length > 0) {
            existingSupplier = nameResult[0];
            existsBy = 'name';
          }
          
          // If not found by name, and we have an ICO, check by ICO
          if (!existingSupplier && supplierIco) {
            const checkByIcoQuery = `
              SELECT nazev, ico FROM "${dodavatelTable}" 
              WHERE ico = $1
              LIMIT 1
            `;
            
            const icoResult = await prisma.$queryRawUnsafe(checkByIcoQuery, supplierIco);
            if (Array.isArray(icoResult) && icoResult.length > 0) {
              existingSupplier = icoResult[0];
              existsBy = 'ico';
            }
          }
          
          // Handle based on what we found
          if (existingSupplier) {
            if (existsBy === 'name') {
              // Already exists with same name
              if (CONFIG.DEBUG) {
                console.log(`Supplier "${supplierName}" already exists by name, skipping`);
              }
              skippedCount++;
              batchSkipped++;
            } 
            else if (existsBy === 'ico') {
              // Already exists with same ICO but different name - update the record
              if (CONFIG.DEBUG) {
                console.log(`Supplier with ICO "${supplierIco}" already exists with name "${existingSupplier.nazev}", updating details if needed`);
              }
              
              // Update the existing record with any new info
              const updateQuery = `
                UPDATE "${dodavatelTable}"
                SET updated_at = CURRENT_TIMESTAMP
                WHERE ico = $1
              `;
              
              await prisma.$executeRawUnsafe(updateQuery, supplierIco);
              
              updatedCount++;
              batchUpdated++;
            }
            continue;
          }
          
          // If supplier doesn't exist, insert with conflict handling
          const currentDate = new Date();
          
          // Use ON CONFLICT to properly handle unique constraint violations
          const insertQuery = supplierIco ? 
            // If we have an ICO, use it in the ON CONFLICT clause
            `
              INSERT INTO "${dodavatelTable}" (
                nazev, 
                ico, 
                datum_zalozeni, 
                created_at, 
                updated_at
              ) VALUES (
                $1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
              )
              ON CONFLICT (ico) DO NOTHING
            `
            :
            // Without ICO, just use name
            `
              INSERT INTO "${dodavatelTable}" (
                nazev, 
                ico, 
                datum_zalozeni, 
                created_at, 
                updated_at
              ) VALUES (
                $1, NULL, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
              )
              ON CONFLICT (nazev) DO NOTHING
            `;
          
          // Execute the query with the right parameters
          if (supplierIco) {
            await prisma.$executeRawUnsafe(insertQuery, supplierName, supplierIco, currentDate);
          } else {
            await prisma.$executeRawUnsafe(insertQuery, supplierName, currentDate);
          }
          
          if (CONFIG.DEBUG) {
            console.log(`Inserted supplier "${supplierName}" with ICO ${supplierIco || 'unknown'}`);
          }
          
          insertedCount++;
          batchInserted++;
        } catch (e) {
          // Log error but continue processing other suppliers
          console.error(`Error processing supplier "${supplierName}" with ICO "${supplierIco}":`, e);
          errorCount++;
          batchErrors++;
        }
      }
      
      console.log(`Supplier batch complete: ${batchInserted} inserted, ${batchUpdated} updated, ${batchSkipped} skipped, ${batchErrors} errors`);
    }
    
    // 4. Verify results
    let finalCount = 0;
    try {
      const countQuery = `SELECT COUNT(*) as count FROM "${dodavatelTable}"`;
      const countResult = await prisma.$queryRawUnsafe(countQuery);
      finalCount = Array.isArray(countResult) && countResult.length > 0 ? Number(countResult[0].count) : 0;
      
      console.log(`Final count in ${dodavatelTable} table: ${finalCount} records`);
    } catch (e) {
      console.error(`Error getting final count from ${dodavatelTable}:`, e);
    }
    
    console.log(`Supplier extraction summary: ${insertedCount} inserted, ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`);
    
    return { 
      inserted: insertedCount, 
      updated: updatedCount,
      skipped: skippedCount, 
      errors: errorCount,
      finalCount
    };
  } catch (e) {
    console.error('Unexpected error in extractSuppliers:', e);
    return { 
      inserted: 0, 
      updated: 0,
      skipped: 0, 
      error: true, 
      message: `Unexpected error in extractSuppliers: ${e instanceof Error ? e.message : String(e)}` 
    };
  }
}

// Function to create contract amendments
async function createAmendmentsForBatch(tableNames: Record<string, string>, contractIds: number[]) {
  console.log(`\n=== CREATING AMENDMENTS FOR ${contractIds.length} CONTRACTS ===`);
  
  const smlouvaTable = tableNames.smlouva || 'smlouva';
  const dodatekTable = tableNames.dodatek || 'dodatek';
  let insertedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  try {
    // 1. Ensure the dodatek table exists
    try {
      console.log(`Checking if ${dodatekTable} table exists...`);
      
      // Try to query the table
      try {
        await prisma.$executeRawUnsafe(`SELECT 1 FROM "${dodatekTable}" LIMIT 1`);
        console.log(`✓ Table ${dodatekTable} exists`);
      } catch (e) {
        console.log(`Creating table ${dodatekTable} as it does not exist...`);
        
        // First attempt with foreign key constraint
        try {
          const createTableQuery = `
            CREATE TABLE IF NOT EXISTS "${dodatekTable}" (
              "id" SERIAL PRIMARY KEY,
              "smlouva_id" INTEGER NOT NULL,
              "castka" DOUBLE PRECISION NOT NULL,
              "datum" TIMESTAMP(3) NOT NULL,
              "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "${dodatekTable}_smlouva_id_fkey" FOREIGN KEY ("smlouva_id") REFERENCES "${smlouvaTable}" ("id") ON DELETE CASCADE
            )
          `;
          
          await prisma.$executeRawUnsafe(createTableQuery);
          console.log(`Table ${dodatekTable} created successfully with foreign key constraint`);
        } catch (e) {
          console.warn(`Warning: Could not create table with foreign key constraint: ${e instanceof Error ? e.message : String(e)}`);
          console.log('Trying to create table without foreign key constraint...');
          
          // Second attempt without foreign key constraint
          const createTableWithoutFKQuery = `
            CREATE TABLE IF NOT EXISTS "${dodatekTable}" (
              "id" SERIAL PRIMARY KEY,
              "smlouva_id" INTEGER NOT NULL,
              "castka" DOUBLE PRECISION NOT NULL,
              "datum" TIMESTAMP(3) NOT NULL,
              "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
            )
          `;
          
          await prisma.$executeRawUnsafe(createTableWithoutFKQuery);
          console.log(`Table ${dodatekTable} created successfully without foreign key constraint`);
        }
      }
    } catch (e) {
      console.error(`CRITICAL ERROR: Failed to ensure ${dodatekTable} table exists:`, e);
      return { 
        inserted: 0, 
        skipped: 0, 
        error: true, 
        message: `Failed to ensure ${dodatekTable} table exists: ${e instanceof Error ? e.message : String(e)}` 
      };
    }
    
    // Get contract IDs if none provided or if force flag is set
    let idsToUse = contractIds;
    
    // Check if we need to use a fallback for contract IDs
    if (contractIds.length === 0 || CONFIG.FORCE_CREATE_AMENDMENTS) {
      console.log(contractIds.length === 0 ? 
        'No contract IDs provided, fetching contracts from database...' : 
        'Force creating amendments for contracts in database...');
      
      try {
        // Get some contract IDs from the database to ensure we create amendments
        const idQuery = `
          SELECT id FROM "${smlouvaTable}" 
          WHERE castka > 1000 
          ORDER BY id DESC 
          LIMIT 50
        `;
        
        const idResult = await prisma.$queryRawUnsafe(idQuery);
        const dbIds = Array.isArray(idResult) ? idResult.map((r: any) => r.id) : [];
        
        if (dbIds.length > 0) {
          console.log(`Found ${dbIds.length} contract IDs in database to create amendments for`);
          idsToUse = dbIds;
        } else {
          console.log('No suitable contracts found in database');
          return { inserted: 0, skipped: 0, errors: 0 };
        }
      } catch (e) {
        console.error('Error fetching contract IDs from database:', e);
        return { inserted: 0, skipped: 0, errors: 0 };
      }
    }
    
    // Exit early if still no contract IDs
    if (!idsToUse.length) {
      console.log('No contract IDs available for amendment creation');
      return { inserted: 0, skipped: 0, errors: 0 };
    }
    
    console.log(`Using ${idsToUse.length} contract IDs for amendment creation`);
    
    // 2. Check if we already have amendments for these contracts
    console.log('Checking for existing amendments...');
    const existingQuery = `
      SELECT smlouva_id, COUNT(*) as count 
      FROM "${dodatekTable}" 
      WHERE smlouva_id IN (${idsToUse.join(',')})
      GROUP BY smlouva_id
    `;
    
    const existingResults = await prisma.$queryRawUnsafe(existingQuery);
    const contractsWithAmendments = new Set(
      Array.isArray(existingResults) ?
        existingResults.map((r: any) => r.smlouva_id) :
        []
    );

    console.log(`Found ${contractsWithAmendments.size} contracts that already have amendments`);

    // 3. Get contract details for the provided IDs
    console.log(`Fetching contract details for ${idsToUse.length} contracts...`);
    const contractsQuery = `
      SELECT id, castka, datum
      FROM "${smlouvaTable}"
      WHERE id IN (${idsToUse.join(',')})
      AND castka > 1000
    `;

    const contracts = await prisma.$queryRawUnsafe(contractsQuery);

    if (!Array.isArray(contracts) || contracts.length === 0) {
      console.log('No suitable contracts found to create amendments for');
      return { inserted: 0, skipped: 0, errors: 0 };
    }

    console.log(`Found ${contracts.length} contracts suitable for amendments`);

    // 4. Process contracts in batches
    const batchSize = CONFIG.BATCH_SIZES.AMENDMENTS;
    const filteredContracts = (contracts as any[]).filter(c => !contractsWithAmendments.has(c.id));

    console.log(`Processing ${filteredContracts.length} contracts without existing amendments`);

    for (let i = 0; i < filteredContracts.length; i += batchSize) {
      const batch = filteredContracts.slice(i, i + batchSize);
      console.log(`Processing amendment batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(filteredContracts.length/batchSize)} (${i+1}-${Math.min(i+batchSize, filteredContracts.length)} of ${filteredContracts.length})`);

      let batchInserted = 0;
      let batchSkipped = 0;
      let batchErrors = 0;

      for (const contract of batch) {
        if (!contract || !contract.id) {
          console.log('Skipping invalid contract record');
          skippedCount++;
          batchSkipped++;
          continue;
        }

        try {
          // Create 1-3 amendments for this contract
          const amendmentCount = Math.floor(Math.random() * 3) + 1;
          if (CONFIG.DEBUG) {
            console.log(`Creating ${amendmentCount} amendments for contract ${contract.id}...`);
          }

          for (let i = 0; i < amendmentCount; i++) {
            // Calculate amount (10-30% of original contract)
            const amount = contract.castka * (0.1 + Math.random() * 0.2);

            // Calculate date (3-12 months after contract date)
            const baseDate = new Date(contract.datum);
            const amendmentDate = new Date(baseDate);
            amendmentDate.setMonth(baseDate.getMonth() + 3 + Math.floor(Math.random() * 9));

            // Create amendment
            const insertQuery = `
              INSERT INTO "${dodatekTable}" (
                smlouva_id,
                castka,
                datum,
                created_at
              ) VALUES (
                $1,
                $2,
                $3,
                CURRENT_TIMESTAMP
              )
            `;

            await prisma.$executeRawUnsafe(insertQuery, contract.id, amount, amendmentDate);

            insertedCount++;
            batchInserted++;
          }
        } catch (e) {
          console.error(`Error creating amendment for contract ${contract.id}:`, e);
          errorCount++;
          batchErrors++;
        }
      }

      console.log(`Amendment batch complete: ${batchInserted} amendments inserted, ${batchSkipped} contracts skipped, ${batchErrors} errors`);
    }

    // 5. Verify results
    let finalCount = 0;
    try {
      const countQuery = `SELECT COUNT(*) as count FROM "${dodatekTable}"`;
      const countResult = await prisma.$queryRawUnsafe(countQuery);
      finalCount = Array.isArray(countResult) && countResult.length > 0 ? Number(countResult[0].count) : 0;

      console.log(`Final count in ${dodatekTable} table: ${finalCount} records`);
    } catch (e) {
      console.error(`Error getting final count from ${dodatekTable}:`, e);
    }

    console.log(`Amendment creation summary: ${insertedCount} inserted, ${skippedCount} skipped, ${errorCount} errors`);
    console.log('=== AMENDMENT CREATION COMPLETE ===\n');

    return {
      inserted: insertedCount,
      skipped: skippedCount,
      errors: errorCount,
      finalCount
    };
  } catch (e) {
    console.error('Unexpected error in createAmendments:', e);
    return {
      inserted: 0,
      skipped: 0,
      error: true,
      message: `Unexpected error in createAmendments: ${e instanceof Error ? e.message : String(e)}`
    };
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

// Main synchronization function - now with batch processing and safe points
export async function syncData() {
  console.log('Starting data synchronization from open data dumps...')
  const startTime = Date.now()

  // Load or initialize safe-point
  let safePoint = loadSafePoint();

  // Initialize safePoint if we're starting a new sync
  if (safePoint.isComplete || CONFIG.FORCE_RESET_SAFEPOINT) {
    console.log('Previous sync was completed or force reset flag is active. Starting a new sync...');
    safePoint = initSafePoint();
  }

  // Get exact table names
  const tableNames = await getExactTableNames();
  const smlouvaTable = tableNames.smlouva || 'smlouva';

  // Ensure database schema has required columns
  await ensureDatabaseSchema(tableNames);

  // Run diagnostic checks before processing
  await diagnosticCheck(tableNames);

  // Calculate the months to download
  // We'll download the last 3 months of data
  const now = new Date()
  const months = []

  for (let i = 0; i < CONFIG.MONTHS_TO_PROCESS; i++) {
    const date = new Date(now)
    date.setMonth(now.getMonth() - i)
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1
    })
  }

  // Skip months that have already been processed completely
  const remainingMonths = months.filter(month => {
    const isProcessed = safePoint.processedMonths.find(
      m => m.year === month.year && m.month === month.month && m.completed
    );
    return !isProcessed;
  });

  console.log(`Processing ${remainingMonths.length} months of data (skipping ${months.length - remainingMonths.length} already processed)`);

  // Set up overall statistics
  let totalNewCount = safePoint.newContracts || 0;
  let totalUpdatedCount = safePoint.updatedContracts || 0;
  let totalSkippedCount = safePoint.skippedContracts || 0;
  let totalErrorCount = safePoint.errorContracts || 0;
  let totalSuppliers = safePoint.extractedSuppliers || 0;
  let totalAmendments = safePoint.createdAmendments || 0;

  // Process each month
  for (const { year, month } of remainingMonths) {
    // Skip if this month is already completed
    const monthIsComplete = safePoint.processedMonths.find(
        m => m.year === year && m.month === month && m.completed
      );

      if (monthIsComplete) {
        console.log(`Skipping ${year}-${month} as it was already processed`);
        continue;
      }

      try {
        // Update safe-point
        safePoint.currentMonth = { year, month };
        saveSafePoint(safePoint);

        // Download and parse the XML dump
        const filePath = await downloadXmlDump(year, month)
        const records = await parseXmlDump(filePath)

        console.log(`Processing ${records.length} records for ${year}-${month}...`);

        // Update total records in safePoint
        safePoint.totalRecords += records.length;
        saveSafePoint(safePoint);

        // Process records in batches
        const batchSize = CONFIG.BATCH_SIZES.CONTRACTS;

        // Continue from the last batch if interrupted
        const startBatch = safePoint.currentMonth?.year === year &&
                            safePoint.currentMonth?.month === month
                            ? safePoint.currentBatch : 0;

        // Track contract IDs for this entire month
        let monthContractIds: number[] = [];

        for (let batchStart = startBatch * batchSize; batchStart < records.length; batchStart += batchSize) {
          // Update current batch
          safePoint.currentBatch = Math.floor(batchStart / batchSize);
          saveSafePoint(safePoint);

          console.log(`\n== Processing batch ${safePoint.currentBatch + 1}/${Math.ceil(records.length/batchSize)} for ${year}-${month} ==`);

          try {
            // Process a batch of contracts
            if (CONFIG.PHASES.IMPORT_CONTRACTS) {
              const batchResult = await processContractBatch(
                records,
                batchStart,
                batchSize,
                smlouvaTable,
                safePoint
              );

              // Update statistics
              totalNewCount += batchResult.newCount;
              totalUpdatedCount += batchResult.updatedCount;
              totalSkippedCount += batchResult.skippedCount;
              totalErrorCount += batchResult.errorCount;

              // Add contract IDs to the month collection
              if (batchResult.contractIds && batchResult.contractIds.length > 0) {
                monthContractIds = [...monthContractIds, ...batchResult.contractIds];
                console.log(`Collected ${batchResult.contractIds.length} contract IDs from this batch, total: ${monthContractIds.length}`);
              }

              // Extract suppliers for this batch if we have a significant number of IDs
              if (CONFIG.PHASES.EXTRACT_SUPPLIERS && batchResult.contractIds.length > 0 &&
                 (batchResult.contractIds.length >= 50 || batchStart + batchSize >= records.length)) {
                console.log(`Extracting suppliers for ${batchResult.contractIds.length} contracts...`);
                const supplierResult = await extractSuppliersFromBatch(tableNames, batchResult.contractIds);
                totalSuppliers += supplierResult.inserted || 0;
                safePoint.extractedSuppliers += supplierResult.inserted || 0;
              }

              // Create amendments for this batch if we have a significant number of IDs
              if (CONFIG.PHASES.CREATE_AMENDMENTS && batchResult.contractIds.length > 0 &&
                 (batchResult.contractIds.length >= 50 || batchStart + batchSize >= records.length)) {
                console.log(`Creating amendments for ${batchResult.contractIds.length} contracts...`);
                const amendmentResult = await createAmendmentsForBatch(tableNames, batchResult.contractIds);
                totalAmendments += amendmentResult.inserted || 0;
                safePoint.createdAmendments += amendmentResult.inserted || 0;
              }
            } else {
              console.log('Skipping contract import phase (disabled in config)');
            }

            // Save progress after each batch
            saveSafePoint(safePoint);

          } catch (batchError) {
            console.error(`Error processing batch ${safePoint.currentBatch + 1} for ${year}-${month}:`, batchError);
            safePoint.errors.push(`Batch ${safePoint.currentBatch + 1} error: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
            saveSafePoint(safePoint);

            // Continue with the next batch
            continue;
          }

          // Log progress after each batch
          console.log(`\nProgress: ${safePoint.processedRecords}/${safePoint.totalRecords} records processed (${Math.round(safePoint.processedRecords/safePoint.totalRecords*100)}%)`);
          console.log(`Contracts: ${safePoint.newContracts} new, ${safePoint.updatedContracts} updated, ${safePoint.skippedContracts} skipped, ${safePoint.errorContracts} errors`);
          console.log(`Suppliers: ${safePoint.extractedSuppliers} extracted`);
          console.log(`Amendments: ${safePoint.createdAmendments} created`);
        }

        // After processing all batches for the month, process any remaining contract IDs
        if (CONFIG.PHASES.EXTRACT_SUPPLIERS && monthContractIds.length > 0) {
          console.log(`\n== Extracting suppliers for all ${monthContractIds.length} contracts collected this month ==`);
          const supplierResult = await extractSuppliersFromBatch(tableNames, monthContractIds);
          totalSuppliers += supplierResult.inserted || 0;
          safePoint.extractedSuppliers += supplierResult.inserted || 0;
          saveSafePoint(safePoint);
        }

        if (CONFIG.PHASES.CREATE_AMENDMENTS && monthContractIds.length > 0) {
          console.log(`\n== Creating amendments for all ${monthContractIds.length} contracts collected this month ==`);
          const amendmentResult = await createAmendmentsForBatch(tableNames, monthContractIds);
          totalAmendments += amendmentResult.inserted || 0;
          safePoint.createdAmendments += amendmentResult.inserted || 0;
          saveSafePoint(safePoint);
        }

        // Mark this month as completed
        safePoint.processedMonths.push({
          year,
          month,
          completed: true
        });

        // Add to collected contract IDs
        if (Array.isArray(safePoint.collectedContractIds)) {
          const uniqueIds = monthContractIds.filter(id => !safePoint.collectedContractIds.includes(id));
          if (uniqueIds.length > 0) {
            safePoint.collectedContractIds = [...safePoint.collectedContractIds, ...uniqueIds];
            console.log(`Added ${uniqueIds.length} unique contract IDs to safe-point collection`);
          }
        }

        // Reset currentBatch for the next month
        safePoint.currentBatch = 0;
        saveSafePoint(safePoint);

      } catch (monthError) {
        console.error(`Error processing data for ${year}-${month}:`, monthError);
        safePoint.errors.push(`Month ${year}-${month} error: ${monthError instanceof Error ? monthError.message : String(monthError)}`);
        saveSafePoint(safePoint);

        // Continue with the next month
        continue;
      }
    }

    // After processing all months, make sure we run supplier and amendment phases if needed
    if (CONFIG.PHASES.EXTRACT_SUPPLIERS &&
        (CONFIG.FORCE_EXTRACT_SUPPLIERS || (safePoint.collectedContractIds && safePoint.collectedContractIds.length > 0))) {
      console.log(`\n== Final supplier extraction phase ==`);
      const contractIds = safePoint.collectedContractIds || [];
      console.log(`Using ${contractIds.length} collected contract IDs from this run`);
      const supplierResult = await extractSuppliersFromBatch(tableNames, contractIds);
      totalSuppliers += supplierResult.inserted || 0;
      safePoint.extractedSuppliers += supplierResult.inserted || 0;
      saveSafePoint(safePoint);
    }

    if (CONFIG.PHASES.CREATE_AMENDMENTS &&
        (CONFIG.FORCE_CREATE_AMENDMENTS || (safePoint.collectedContractIds && safePoint.collectedContractIds.length > 0))) {
      console.log(`\n== Final amendment creation phase ==`);
      const contractIds = safePoint.collectedContractIds || [];
      console.log(`Using ${contractIds.length} collected contract IDs from this run`);
      const amendmentResult = await createAmendmentsForBatch(tableNames, contractIds);
      totalAmendments += amendmentResult.inserted || 0;
      safePoint.createdAmendments += amendmentResult.inserted || 0;
      saveSafePoint(safePoint);
    }

    // Final diagnostic check
    console.log('\n=== Running final diagnostic check ===');
    await diagnosticCheck(tableNames);

    // Mark sync as complete
    safePoint.isComplete = true;
    safePoint.currentMonth = null;
    safePoint.currentBatch = 0;
    saveSafePoint(safePoint);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    const summary = {
      duration: `${duration} seconds`,
      contracts: {
        processed: safePoint.processedRecords,
        new: safePoint.newContracts,
        updated: safePoint.updatedContracts,
        skipped: safePoint.skippedContracts,
        errors: safePoint.errorContracts
      },
      suppliers: {
        extracted: safePoint.extractedSuppliers
      },
      amendments: {
        created: safePoint.createdAmendments
      },
      errors: safePoint.errors
    };

    console.log(`\n=== Synchronization completed in ${duration} seconds ===`);
    console.log(`Contract summary: ${safePoint.processedRecords} processed, ${safePoint.newContracts} new, ${safePoint.updatedContracts} updated, ${safePoint.skippedContracts} skipped, ${safePoint.errorContracts} errors`);
    console.log(`Supplier extraction: ${safePoint.extractedSuppliers} suppliers added`);
    console.log(`Amendment creation: ${safePoint.createdAmendments} amendments created`);

    if (safePoint.errors.length > 0) {
      console.log(`\nEncountered ${safePoint.errors.length} errors during processing:`);
      safePoint.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }

    return summary;
}

// Direct execution functions for individual phases
export async function directlyExtractSuppliers(): Promise<any> {
  try {
    console.log('Starting direct supplier extraction...');

    // Get table names
    const tableNames = await getExactTableNames();

    // Run the extraction with empty IDs array (will force fallback behavior)
    const result = await extractSuppliersFromBatch(tableNames, []);

    console.log('Direct supplier extraction complete');
    return result;
  } catch (error) {
    console.error('Error in direct supplier extraction:', error);
    return { error: true, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function directlyCreateAmendments(): Promise<any> {
  try {
    console.log('Starting direct amendment creation...');

    // Get table names
    const tableNames = await getExactTableNames();

    // Run the amendment creation with empty IDs array (will force fallback behavior)
    const result = await createAmendmentsForBatch(tableNames, []);

    console.log('Direct amendment creation complete');
    return result;
  } catch (error) {
    console.error('Error in direct amendment creation:', error);
    return { error: true, message: error instanceof Error ? error.message : String(error) };
  }
}

// Command line execution
if (require.main === module) {
  (async () => {
    try {
      // Command line arguments
      const args = process.argv.slice(2);
      const command = args[0] || 'sync';

      // Check for reset flag
      if (args.includes('--reset') || args.includes('-r')) {
        console.log('Force resetting safe-point...');
        process.env.FORCE_RESET_SAFEPOINT = 'true';
      }

      // Check for debug flag
      if (args.includes('--debug') || args.includes('-d')) {
        console.log('Enabling debug mode...');
        process.env.DEBUG = 'true';
      }

      // Check for force supplier extraction flag
      if (args.includes('--force-suppliers') || args.includes('-s')) {
        console.log('Forcing supplier extraction...');
        process.env.FORCE_EXTRACT_SUPPLIERS = 'true';
      }

      // Check for force amendment creation flag
      if (args.includes('--force-amendments') || args.includes('-a')) {
        console.log('Forcing amendment creation...');
        process.env.FORCE_CREATE_AMENDMENTS = 'true';
      }

      switch (command) {
        case 'suppliers':
          console.log('Running supplier extraction only...');
          await directlyExtractSuppliers();
          break;
        case 'amendments':
          console.log('Running amendment creation only...');
          await directlyCreateAmendments();
          break;
        case 'sync':
        default:
          console.log('Running full sync process...');
          await syncData();
          break;
      }

      console.log('Process completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Fatal error in main process:', error);
      process.exit(1);
    }
  })();
}

export default { syncData, directlyExtractSuppliers, directlyCreateAmendments };
