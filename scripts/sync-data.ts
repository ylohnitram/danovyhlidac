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

// Interface for contractParty to avoid 'any' types
interface ContractParty {
  nazev?: any[];
  prijemce?: any[];
  adresa?: any[];
  [key: string]: any;
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
    
    // Log the contract structure in debug mode
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
    
    // Extract supplier and contracting authority information
    let dodavatel = 'Neuvedeno';
    let zadavatel = 'Neuvedeno';
    
    // IMPROVED: Debug log to help identify what we're finding
    if (process.env.DEBUG) {
      console.log('smluvniStrana:', JSON.stringify(contract.smluvniStrana, null, 2));
      console.log('subjekt:', JSON.stringify(contract.subjekt, null, 2));
      console.log('schvalil:', JSON.stringify(contract.schvalil, null, 2));
    }
    
    // APPROACH 1: Try to extract from schvalil field, which often contains the contracting authority
    if (contract.schvalil && zadavatel === 'Neuvedeno') {
      zadavatel = extractFirstValue(contract.schvalil) || 'Neuvedeno';
      
      // If it's just a name, try to make it more descriptive
      if (zadavatel !== 'Neuvedeno' && !zadavatel.includes(' a.s.') && !zadavatel.includes(' s.r.o.') && !zadavatel.includes('obec') && !zadavatel.includes('úřad')) {
        zadavatel = `Úřad/organizace schváleno: ${zadavatel}`;
      }
    }
    
    // APPROACH 2: Check if there's a subjekt that looks like a government entity
    if (contract.subjekt && zadavatel === 'Neuvedeno') {
      // Try to identify contracting authorities by name pattern
      const governmentEntities = contract.subjekt.filter((s: any) => {
        const name = extractFirstValue(s.nazev) || '';
        return name.toLowerCase().includes('ministerstvo') || 
               name.toLowerCase().includes('úřad') || 
               name.toLowerCase().includes('magistrát') || 
               name.toLowerCase().includes('kraj') ||
               name.toLowerCase().includes('město') ||
               name.toLowerCase().includes('obec');
      });
      
      if (governmentEntities.length > 0) {
        zadavatel = extractFirstValue(governmentEntities[0].nazev) || 'Neuvedeno';
      }
    }
    
    // APPROACH 3: Try to use smluvniStrana with more advanced logic
    if (contract.smluvniStrana) {
      const parties: ContractParty[] = contract.smluvniStrana;
      
      // Find parties that are marked as prijemce (likely suppliers)
      const suppliersWithFlag = parties.filter((p: ContractParty) => {
        return p.prijemce && extractFirstValue(p.prijemce) === 'true';
      });
      
      // Find parties that have names that sound like government entities
      const governmentParties = parties.filter((p: ContractParty) => {
        const name = extractFirstValue(p.nazev) || '';
        return name.toLowerCase().includes('ministerstvo') || 
               name.toLowerCase().includes('úřad') || 
               name.toLowerCase().includes('magistrát') || 
               name.toLowerCase().includes('kraj') ||
               name.toLowerCase().includes('město') ||
               name.toLowerCase().includes('obec');
      });
      
      // Use prijemce flag to identify supplier
      if (suppliersWithFlag.length > 0 && dodavatel === 'Neuvedeno') {
        dodavatel = extractFirstValue(suppliersWithFlag[0].nazev) || 'Neuvedeno';
      }
      
      // Use name pattern to identify contracting authority
      if (governmentParties.length > 0 && zadavatel === 'Neuvedeno') {
        zadavatel = extractFirstValue(governmentParties[0].nazev) || 'Neuvedeno';
      }
      
      // If we identified one party but not the other, and there are exactly 2 parties,
      // then the other party is the one we're missing
      if ((dodavatel === 'Neuvedeno' || zadavatel === 'Neuvedeno') && parties.length === 2) {
        if (dodavatel !== 'Neuvedeno' && zadavatel === 'Neuvedeno') {
          // We found the supplier but not the authority - the other party must be the authority
          const otherParty = parties.find((p: ContractParty) => extractFirstValue(p.nazev) !== dodavatel);
          if (otherParty) {
            zadavatel = extractFirstValue(otherParty.nazev) || 'Neuvedeno';
          }
        } else if (dodavatel === 'Neuvedeno' && zadavatel !== 'Neuvedeno') {
          // We found the authority but not the supplier - the other party must be the supplier
          const otherParty = parties.find((p: ContractParty) => extractFirstValue(p.nazev) !== zadavatel);
          if (otherParty) {
            dodavatel = extractFirstValue(otherParty.nazev) || 'Neuvedeno';
          }
        }
      }
      
      // If we still haven't found both parties and there are multiple parties,
      // assume the first one who isn't the one we've found is the other party
      if ((dodavatel === 'Neuvedeno' || zadavatel === 'Neuvedeno') && parties.length > 0) {
        if (dodavatel === 'Neuvedeno' && zadavatel !== 'Neuvedeno') {
          // Find first party that's not the authority
          const otherParty = parties.find((p: ContractParty) => extractFirstValue(p.nazev) !== zadavatel);
          if (otherParty) {
            dodavatel = extractFirstValue(otherParty.nazev) || 'Neuvedeno';
          } else if (parties.length > 0) {
            // If we can't find a distinct party, use the first one
            dodavatel = extractFirstValue(parties[0].nazev) || 'Neuvedeno';
          }
        } else if (dodavatel !== 'Neuvedeno' && zadavatel === 'Neuvedeno') {
          // Find first party that's not the supplier
          const otherParty = parties.find((p: ContractParty) => extractFirstValue(p.nazev) !== dodavatel);
          if (otherParty) {
            zadavatel = extractFirstValue(otherParty.nazev) || 'Neuvedeno';
          } else if (parties.length > 0) {
            // If we can't find a distinct party, use the first one
            zadavatel = extractFirstValue(parties[0].nazev) || 'Neuvedeno';
          }
        } else if (dodavatel === 'Neuvedeno' && zadavatel === 'Neuvedeno' && parties.length >= 2) {
          // If we found neither and there are at least 2 parties, use the first two
          zadavatel = extractFirstValue(parties[0].nazev) || 'Neuvedeno';
          dodavatel = extractFirstValue(parties[1].nazev) || 'Neuvedeno';
        } else if (dodavatel === 'Neuvedeno' && zadavatel === 'Neuvedeno' && parties.length === 1) {
          // If there's only one party, use it as the zadavatel (more likely)
          zadavatel = extractFirstValue(parties[0].nazev) || 'Neuvedeno';
        }
      }
    }
    
    // APPROACH 4: Final fallback to direct fields
    if (dodavatel === 'Neuvedeno' && contract.dodavatel) {
      if (typeof contract.dodavatel[0] === 'object') {
        dodavatel = extractFirstValue(contract.dodavatel[0].nazev) || 'Neuvedeno';
      } else {
        dodavatel = extractFirstValue(contract.dodavatel) || 'Neuvedeno';
      }
    }
    
    if (zadavatel === 'Neuvedeno' && contract.zadavatel) {
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
    
    // IMPROVED: Add debug output for what we found to help with troubleshooting
    if (process.env.DEBUG && (dodavatel === 'Neuvedeno' || zadavatel === 'Neuvedeno')) {
      console.log('WARNING - Missing party info:');
      console.log(`  Dodavatel: ${dodavatel}`);
      console.log(`  Zadavatel: ${zadavatel}`);
      console.log('Raw contract data:', JSON.stringify(contract, null, 2));
    }
    
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

// Vylepšená funkce pro geocoding pomocí Nominatim API
async function geocodeAddress(address: string | null, zadavatel: string | null): Promise<{ lat: number, lng: number } | null> {
  try {
    // Pokud nemáme ani adresu ani zadavatele, nemůžeme nic dělat
    if (!address && !zadavatel) {
      return null;
    }

    // Prioritizovat adresu, pokud je k dispozici, jinak použít město ze zadavatele
    let searchQuery = '';
    
    if (address) {
      // Vyčistit a normalizovat adresu
      searchQuery = address.trim();
    } else if (zadavatel) {
      // Extrahovat možné město ze zadavatele
      // Například "Město Brno" -> "Brno" nebo "Magistrát města Olomouce" -> "Olomouc"
      const cityMatches = zadavatel.match(/(?:(?:Město|Obec|Magistrát města)\s+)(\w+)/i);
      
      if (cityMatches && cityMatches[1]) {
        searchQuery = cityMatches[1];
      } else {
        // Pokud nemůžeme extrahovat město ze zadavatele, použijeme celý název zadavatele
        searchQuery = zadavatel;
      }
    }
    
    // Přidat "Česká republika" k vyhledávání pro zlepšení přesnosti
    searchQuery = `${searchQuery}, Česká republika`;
    
    // Logování pro účely ladění
    if (process.env.DEBUG) {
      console.log(`Geocoding query: "${searchQuery}"`);
    }

    // Zpoždění, abychom respektovali omezení Nominatim API (max 1 požadavek za sekundu)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Volání Nominatim API
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&countrycodes=cz`;
    
    const response = await fetch(url, {
      headers: {
        // Důležité: Přidat User-Agent header, Nominatim to vyžaduje
        'User-Agent': 'DanovyHlidac/1.0 (https://example.com; your-email@example.com)',
        'Accept-Language': 'cs,en'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Nominatim API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      // Máme výsledek geocodingu
      const result = data[0];
      
      if (process.env.DEBUG) {
        console.log(`Geocoding result for "${searchQuery}":`, {
          lat: result.lat,
          lon: result.lon,
          display_name: result.display_name,
          type: result.type
        });
      }
      
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      };
    } else {
      // Žádný výsledek, zkusíme alternativní přístup
      if (process.env.DEBUG) {
        console.log(`No geocoding results for "${searchQuery}"`);
      }
      
      // Pokud jsme nejprve zkusili adresu a neuspěli, zkusíme zadavatele
      if (address && zadavatel && searchQuery !== `${zadavatel}, Česká republika`) {
        // Zkusíme znovu s vlastním jménem zadavatele
        return geocodeAddress(null, zadavatel);
      }
      
      // Fallback: Vrátit přibližné souřadnice pro ČR, pokud vše ostatní selže
      if (process.env.DEBUG) {
        console.log('Using fallback coordinates for the Czech Republic');
      }
      
      return {
        lat: 49.8 + (Math.random() - 0.5) * 0.5, // Přibližně v ČR s menší odchylkou
        lng: 15.5 + (Math.random() - 0.5) * 0.5
      };
    }
  } catch (error) {
    console.error(`Error geocoding "${address || zadavatel}":`, error);
    
    // Fallback v případě chyby
    return {
      lat: 49.8 + (Math.random() - 0.5) * 0.5,
      lng: 15.5 + (Math.random() - 0.5) * 0.5
    };
  }
}

// Vylepšená funkce pro získání adresy a zadavatele ze smlouvy
function extractAddressAndAuthority(record: any): { address: string | null, authority: string | null } {
  let address: string | null = null;
  let authority: string | null = null;
  
  try {
    const contract = record.smlouva ? record.smlouva[0] : record;
    
    // 1. Zkusit získat adresu z subjekt
    if (contract.subjekt) {
      // Hledat subjekty, které vypadají jako zadavatelé
      const authorities = contract.subjekt.filter((s: any) => {
        if (s.typ) {
          const typValue = extractFirstValue(s.typ);
          return typValue ? typValue.toLowerCase().includes('zadavatel') : false;
        }
        
        // Zkusit identifikovat zadavatele podle názvu
        const name = extractFirstValue(s.nazev) || '';
        return name.toLowerCase().includes('ministerstvo') || 
               name.toLowerCase().includes('úřad') || 
               name.toLowerCase().includes('kraj') ||
               name.toLowerCase().includes('město') ||
               name.toLowerCase().includes('obec');
      });
      
      if (authorities.length > 0) {
        // Nalezen potenciální zadavatel
        const mainAuthority = authorities[0];
        
                  // Získat adresu
        if (mainAuthority.adresa) {
          address = extractFirstValue(mainAuthority.adresa) || null;
        }
        
        // Získat název zadavatele
        if (mainAuthority.nazev) {
          authority = extractFirstValue(mainAuthority.nazev) || null;
        }
      }
    }
    
    // 2. Zkusit získat adresu z smluvniStrana
    if ((!address || !authority) && contract.smluvniStrana) {
      const parties = contract.smluvniStrana;
      
      // Hledat strany, které vypadají jako zadavatelé
      const authParties = parties.filter((p: any) => {
        const name = extractFirstValue(p.nazev) || '';
        return name.toLowerCase().includes('ministerstvo') || 
               name.toLowerCase().includes('úřad') || 
               name.toLowerCase().includes('kraj') ||
               name.toLowerCase().includes('město') ||
               name.toLowerCase().includes('obec');
      });
      
      if (authParties.length > 0) {
        const authParty = authParties[0];
        
        // Získat adresu, pokud ještě nemáme
        if (!address && authParty.adresa) {
          address = extractFirstValue(authParty.adresa) || null;
        }
        
        // Získat název zadavatele, pokud ještě nemáme
        if (!authority && authParty.nazev) {
          authority = extractFirstValue(authParty.nazev) || null;
        }
      } else if (parties.length > 0) {
        // Pokud jsme nenašli zadavatele podle názvu, použijeme první stranu
        const firstParty = parties[0];
        
        // Získat adresu, pokud ještě nemáme
        if (!address && firstParty.adresa) {
          address = extractFirstValue(firstParty.adresa) || null;
        }
        
        // Získat název zadavatele, pokud ještě nemáme
        if (!authority && firstParty.nazev) {
          authority = extractFirstValue(firstParty.nazev) || null;
        }
      }
    }
    
    // 3. Zkusit získat zadavatele z schvalil pole
    if (!authority && contract.schvalil) {
      authority = extractFirstValue(contract.schvalil) || null;
    }
    
    // Ensure we return null instead of undefined
    return { 
      address: address || null, 
      authority: authority || null 
    };
  } catch (error) {
    console.error('Error extracting address and authority:', error);
    return { address: null, authority: null };
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
    
    // Cast the result to an appropriate type and handle possible undefined values
    const resultArray = result as Array<{updated_at?: Date}>;
    lastSync = resultArray.length > 0 && resultArray[0]?.updated_at 
      ? resultArray[0].updated_at 
      : new Date(0);
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
          let existingContract: { id: number, lat?: number, lng?: number } | null = null;
          
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
              // Properly check if the result is an array with at least one element
              const resultArray = result as Array<{ id: number, lat?: number, lng?: number }>;
              if (resultArray.length > 0) {
                existingContract = resultArray[0];
              }
            } catch (findError) {
              console.error('Error finding existing contract:', findError);
            }
          }
          
          // Add geolocation if we don't have it
          if (!existingContract?.lat || !existingContract?.lng) {
            // Použít vylepšenou funkci pro získání adresy a zadavatele
            const { address, authority } = extractAddressAndAuthority(record);
            
            if (process.env.DEBUG) {
              console.log(`Extracted for geocoding - Address: "${address}", Authority: "${authority}"`);
            }
            
            // Získat geolokaci na základě adresy nebo jména zadavatele
            if (address || authority) {
              try {
                const geoData = await geocodeAddress(address, authority || contractData.zadavatel);
                if (geoData) {
                  contractData.lat = geoData.lat;
                  contractData.lng = geoData.lng;
                  
                  if (process.env.DEBUG) {
                    console.log(`Geocoding successful: ${geoData.lat}, ${geoData.lng}`);
                  }
                }
              } catch (geoError) {
                console.error(`Error geocoding for contract ${contractData.nazev}:`, geoError);
                // Nechat souřadnice undefined - budou nastaveny na NULL v databázi
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
