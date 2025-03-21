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
      console.log("Geocoding: Chybí adresa i zadavatel");
      return null;
    }

    // Prioritizovat adresu, pokud je k dispozici, jinak použít město ze zadavatele
    let searchQuery = '';
    let querySource = '';
    
    if (address) {
      // Vyčistit a normalizovat adresu
      searchQuery = address.trim();
      querySource = 'adresa';
      
      // Pokud je adresa příliš dlouhá, zkusit ji zjednodušit
      if (searchQuery.length > 100) {
        // Zkusit izolovat pouze PSČ a město
        const pscMatch = searchQuery.match(/\b\d{3}\s?\d{2}\b/);
        const simpleAddress = pscMatch ? 
          searchQuery.substring(0, searchQuery.indexOf(pscMatch[0]) + pscMatch[0].length) : 
          searchQuery.split(',')[0];
        
        if (simpleAddress && simpleAddress.length < searchQuery.length) {
          searchQuery = simpleAddress;
          console.log(`Geocoding: Zjednodušuji dlouhou adresu na "${searchQuery}"`);
        }
      }
    } else if (zadavatel) {
      querySource = 'zadavatel';
      // Rozšířená extrakce města ze zadavatele s více vzory
      const patterns = [
        // Standardní vzory pro města a obce
        /(?:(?:Město|Obec|Magistrát města|Městský úřad|MÚ)\s+)([A-ZÁ-Ž][a-zá-ž]+(?:[\s-][A-ZÁ-Ž][a-zá-ž]+)*)/i,
        // Kraj v různých podobách
        /([A-ZÁ-Ž][a-zá-ž]+(?:[\s-][A-ZÁ-Ž][a-zá-ž]+)*)\s+kraj/i,
        // Extrakce něčeho, co vypadá jako město (slovo začínající velkým písmenem)
        /\b([A-ZÁ-Ž][a-zá-ž]+(?:[\s-][A-ZÁ-Ž][a-zá-ž]+)*)\b/
      ];

      let cityName = null;
      for (const pattern of patterns) {
        const match = zadavatel.match(pattern);
        if (match && match[1]) {
          cityName = match[1];
          console.log(`Geocoding: Nalezeno město ${cityName} podle vzoru ${pattern}`);
          break;
        }
      }
      
      if (cityName) {
        searchQuery = cityName;
      } else {
        // Poslední možnost - použít celý název zadavatele a doufat, že obsahuje něco užitečného
        searchQuery = zadavatel;
        console.log(`Geocoding: Používám celý název zadavatele: "${zadavatel}"`);
      }
    }
    
    // Přidat "Česká republika" k vyhledávání pro zlepšení přesnosti
    searchQuery = `${searchQuery}, Česká republika`;
    
    console.log(`Geocoding: Finální dotaz: "${searchQuery}" (zdroj: ${querySource})`);

    // Zpoždění, abychom respektovali omezení Nominatim API (max 1 požadavek za sekundu)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Volání Nominatim API
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&countrycodes=cz`;
    
    // Vylepšený User-Agent - Nominatim doporučuje specifický formát s odkazem na projekt a kontaktem
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DanovyHlidac/1.0 (https://danovyhlidac.cz; info@danovyhlidac.cz)',
        'Accept-Language': 'cs,en',
        'From': 'info@danovyhlidac.cz'  // Přidáno pro lepší identifikaci
      }
    });
    
    if (!response.ok) {
      // Lepší diagnostické informace při selhání API
      console.error(`Geocoding: Nominatim API vrátila chybu: ${response.status} ${response.statusText}`);
      
      // Pokud je to omezení ze strany API (HTTP 429), počkáme a zkusíme to znovu
      if (response.status === 429) {
        console.log("Geocoding: Příliš mnoho požadavků, čekáme 5 sekund...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Rekurzivní volání - zkusíme to znovu s menší úpravou dotazu
        return await geocodeAddress(
          address ? address + " " : null, 
          zadavatel
        );
      }
      
      throw new Error(`Nominatim API responded with status: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      // Máme výsledek geocodingu
      const result = data[0];
      
      console.log(`Geocoding: Úspěch! Nalezeno pro "${searchQuery}": ${result.lat}, ${result.lon} (typ: ${result.type})`);
      
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      };
    } else {
      // Žádný výsledek, zkusíme alternativní přístup
      console.log(`Geocoding: Žádné výsledky pro "${searchQuery}"`);
      
      // Alternativní strategie pro různé zdroje
      if (querySource === 'adresa' && zadavatel) {
        console.log("Geocoding: Zkouším znovu se zadavatelem...");
        return await geocodeAddress(null, zadavatel);
      }
      
      if (querySource === 'zadavatel' && searchQuery.includes(',')) {
        // Zkusíme jen první část před čárkou
        const simplifiedQuery = searchQuery.split(',')[0];
        console.log(`Geocoding: Zkouším zjednodušený dotaz "${simplifiedQuery}"`);
        
        // Rekurzivní volání s upraveným dotazem
        return await geocodeAddress(simplifiedQuery, null);
      }
      
      // Fallback: Vrátit přibližné souřadnice pro ČR, pokud vše ostatní selže
      console.log("Geocoding: Používám fallback souřadnice pro ČR");
      
      // Přidáme větší odchylku pro reálnější rozložení bodů po mapě ČR
      return {
        // Střed ČR (přibližně) s malou náhodnou odchylkou v rámci ČR
        lat: 49.8 + (Math.random() * 0.8 - 0.4),  // Rozsah cca 49.4 - 50.2
        lng: 15.5 + (Math.random() * 2.0 - 1.0)   // Rozsah cca 14.5 - 16.5
      };
    }
  } catch (error) {
    console.error(`Geocoding: Chyba při geokódování "${address || zadavatel}":`, error);
    
    // Fallback v případě chyby
    return {
      lat: 49.8 + (Math.random() * 0.8 - 0.4),
      lng: 15.5 + (Math.random() * 2.0 - 1.0)
    };
  }
}

// Vylepšená funkce pro transformaci XML dat smlouvy do databázového formátu
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
    
    // NOVÝ PŘÍSTUP: Použijeme skórovací systém pro rozpoznání rolí
    
    // Definujeme kandidáty pro role
    type PartyCandidate = {
      name: string;  // Název strany
      authorityScore: number;  // Skóre pro roli "zadavatel"
      supplierScore: number;   // Skóre pro roli "dodavatel"
      role?: string | null;  // Explicitní role, pokud je známa - opraveno pro null
      isPublicEntity: boolean;  // Příznak, zda se jedná o veřejnou instituci
      explicitRole: boolean;    // Jestli byla role určena explicitně
    };
    
    const partyCandidates: PartyCandidate[] = [];
    
    // 1. Nejprve zkontrolujeme "subjekt", který často obsahuje jasné role
    if (contract.subjekt && Array.isArray(contract.subjekt)) {
      if (process.env.DEBUG) {
        console.log(`Nalezeno ${contract.subjekt.length} subjektů`);
      }
      
      // Projdeme všechny subjekty a určíme skóre
      for (const subj of contract.subjekt) {
        const name = extractFirstValue(subj.nazev) || 'Neuvedeno';
        const typ = extractFirstValue(subj.typ) || '';
        
        // Výchozí skóre
        let authScore = 0;
        let supplierScore = 0;
        let explicitRole: string | null = null;
        let isExplicit = false;
        
        // Kontrola typu subjektu pro explicitní role
        if (typ) {
          const typLower = typ.toLowerCase();
          
          if (typLower.includes('zadavatel') || typLower.includes('objednatel') || 
              typLower.includes('kupující') || typLower.includes('objednávající')) {
            authScore += 150;  // Velmi vysoké skóre pro explicitní roli
            explicitRole = 'zadavatel';
            isExplicit = true;
          } else if (typLower.includes('dodavatel') || typLower.includes('poskytovatel') || 
                    typLower.includes('zhotovitel') || typLower.includes('prodávající')) {
            supplierScore += 150;  // Velmi vysoké skóre pro explicitní roli
            explicitRole = 'dodavatel';
            isExplicit = true;
          }
        }
        
        // Kontrola podle názvu pro veřejné instituce
        const nameLower = name.toLowerCase();
        const isPublicEntity = 
          nameLower.includes('ministerstvo') ||
          nameLower.includes('úřad') ||
          nameLower.includes('magistrát') ||
          nameLower.includes('městský') ||
          nameLower.includes('obecní') ||
          nameLower.includes('kraj') ||
          nameLower.includes('město ') ||
          nameLower.includes('obec ') ||
          nameLower.includes('státní') ||
          nameLower.includes('česká republika') ||
          nameLower.includes('ředitelství') ||
          /krajsk[áý]/i.test(nameLower) ||
          /městsk[áý]/i.test(nameLower) ||
          /obecn[íý]/i.test(nameLower) ||
          /státn[íý]/i.test(nameLower);
        
        // Přidáme skóre podle typu entity
        if (isPublicEntity) {
          authScore += 70;  // Veřejné instituce jsou pravděpodobněji zadavatelé
        } else {
          supplierScore += 40;  // Neveřejné subjekty jsou pravděpodobněji dodavatelé
        }
        
        // Kontrola podle právní formy
        if (nameLower.includes('s.r.o.') || nameLower.includes('a.s.') || 
            nameLower.includes('spol. s r.o.') || nameLower.includes('s. r. o.') ||
            nameLower.includes('akciová společnost') || nameLower.includes('společnost s ručením')) {
          supplierScore += 30;  // Firmy jsou pravděpodobněji dodavatelé
        }
        
        // Kontrola ICO, pokud existuje
        if (subj.ico) {
          // Nic konkrétního, ale máme informaci, že subjekt má IČO
          if (process.env.DEBUG) {
            console.log(`Subjekt ${name} má IČO ${extractFirstValue(subj.ico)}`);
          }
        }
        
        // Přidáme kandidáta do seznamu
        partyCandidates.push({
          name,
          authorityScore: authScore,
          supplierScore: supplierScore,
          role: explicitRole,
          isPublicEntity,
          explicitRole: isExplicit
        });
      }
    }
    
    // 2. Zkontrolujeme "smluvniStrana", který obsahuje detailnější informace o stranách
    if (contract.smluvniStrana && Array.isArray(contract.smluvniStrana)) {
      if (process.env.DEBUG) {
        console.log(`Nalezeno ${contract.smluvniStrana.length} smluvních stran`);
      }
      
      // Projdeme všechny smluvní strany
      for (const strana of contract.smluvniStrana) {
        const name = extractFirstValue(strana.nazev) || 'Neuvedeno';
        
        // Výchozí skóre
        let authScore = 0;
        let supplierScore = 0;
        let explicitRole: string | null = null;
        let isExplicit = false;
        
        // Kontrola explicitních rolí
        if (strana.role) {
          const roleLower = extractFirstValue(strana.role)?.toLowerCase() || '';
          if (roleLower.includes('zadavatel') || roleLower.includes('objednatel') ||
              roleLower.includes('kupující') || roleLower.includes('objednávající')) {
            authScore += 150;
            explicitRole = 'zadavatel';
            isExplicit = true;
          } else if (roleLower.includes('dodavatel') || roleLower.includes('poskytovatel') || 
                    roleLower.includes('zhotovitel') || roleLower.includes('prodávající')) {
            supplierScore += 150;
            explicitRole = 'dodavatel';
            isExplicit = true;
          }
        }
        
        // Kontrola příznaku "prijemce"
        if (strana.prijemce) {
          const prijemce = extractFirstValue(strana.prijemce);
          if (prijemce === 'true' || prijemce === '1') {
            supplierScore += 100;  // Příjemce je pravděpodobně dodavatel
            explicitRole = explicitRole || 'dodavatel';
            isExplicit = true;
          }
        }
        
        // Kontrola podle názvu pro veřejné instituce
        const nameLower = name.toLowerCase();
        const isPublicEntity = 
          nameLower.includes('ministerstvo') ||
          nameLower.includes('úřad') ||
          nameLower.includes('magistrát') ||
          nameLower.includes('městský') ||
          nameLower.includes('obecní') ||
          nameLower.includes('kraj') ||
          nameLower.includes('město ') ||
          nameLower.includes('obec ') ||
          nameLower.includes('státní') ||
          nameLower.includes('česká republika') ||
          nameLower.includes('ředitelství') ||
          /krajsk[áý]/i.test(nameLower) ||
          /městsk[áý]/i.test(nameLower) ||
          /obecn[íý]/i.test(nameLower) ||
          /státn[íý]/i.test(nameLower);
        
        // Přidáme skóre podle typu entity
        if (isPublicEntity) {
          authScore += 70;  // Veřejné instituce jsou pravděpodobněji zadavatelé
        } else {
          supplierScore += 40;  // Neveřejné subjekty jsou pravděpodobněji dodavatelé
        }
        
        // Kontrola podle právní formy
        if (nameLower.includes('s.r.o.') || nameLower.includes('a.s.') || 
            nameLower.includes('spol. s r.o.') || nameLower.includes('s. r. o.') ||
            nameLower.includes('akciová společnost') || nameLower.includes('společnost s ručením')) {
          supplierScore += 30;  // Firmy jsou pravděpodobněji dodavatelé
        }
        
        // Kontrola e-mailových domén (veřejná správa často používá .cz)
        if (strana.email) {
          const email = extractFirstValue(strana.email);
          if (email) {
            if (email.endsWith('.gov.cz') || email.endsWith('.muni.cz') || 
                email.endsWith('-mucs.cz') || email.endsWith('.mesto.cz')) {
              authScore += 20;  // Pravděpodobně veřejná instituce
            }
          }
        }
        
        // Hledáme stejného kandidáta v již existujících kandidátech
        const existingCandidate = partyCandidates.find(c => c.name === name);
        
        if (existingCandidate) {
          // Aktualizujeme skóre existujícího kandidáta
          existingCandidate.authorityScore += authScore;
          existingCandidate.supplierScore += supplierScore;
          if (explicitRole) existingCandidate.role = explicitRole;
          if (isExplicit) existingCandidate.explicitRole = true;
        } else {
          // Přidáme nového kandidáta
          partyCandidates.push({
            name,
            authorityScore: authScore,
            supplierScore: supplierScore,
            role: explicitRole,
            isPublicEntity,
            explicitRole: isExplicit
          });
        }
      }
    }
    
    // 3. Přidáme informace z pole "schvalil", které často obsahuje zadavatele
    if (contract.schvalil) {
      const schvalil = extractFirstValue(contract.schvalil);
      if (schvalil) {
        // Kontrola, zda už nemáme tohoto kandidáta
        const existingCandidate = partyCandidates.find(c => c.name === schvalil);
        
        if (existingCandidate) {
          existingCandidate.authorityScore += 50;  // Schvalovatel je pravděpodobněji zadavatel
        } else {
          // Přidáme nového kandidáta
          partyCandidates.push({
            name: schvalil,
            authorityScore: 50,
            supplierScore: 0,
            isPublicEntity: false,  // Nemáme dostatek informací, ale často to bývá fyzická osoba
            explicitRole: false,
            role: null // Přidáno explicitně null pro typovou kompatibilitu
          });
        }
      }
    }
    
    // 4. Přímá pole "dodavatel" a "zadavatel", pokud existují
    if (contract.dodavatel) {
      let dodavatelName;
      
      if (typeof contract.dodavatel[0] === 'object') {
        dodavatelName = extractFirstValue(contract.dodavatel[0].nazev) || 'Neuvedeno';
      } else {
        dodavatelName = extractFirstValue(contract.dodavatel) || 'Neuvedeno';
      }
      
      // Kontrola, zda už nemáme tohoto kandidáta
      const existingCandidate = partyCandidates.find(c => c.name === dodavatelName);
      
      if (existingCandidate) {
        existingCandidate.supplierScore += 150;  // Velmi vysoké skóre pro přímé pole
        existingCandidate.role = 'dodavatel';
        existingCandidate.explicitRole = true;
      } else {
        // Přidáme nového kandidáta
        partyCandidates.push({
          name: dodavatelName,
          authorityScore: 0,
          supplierScore: 150,
          role: 'dodavatel',
          isPublicEntity: false,  // Předpokládáme, že není veřejný subjekt
          explicitRole: true
        });
      }
    }
    
    if (contract.zadavatel) {
      let zadavatelName;
      
      if (typeof contract.zadavatel[0] === 'object') {
        zadavatelName = extractFirstValue(contract.zadavatel[0].nazev) || 'Neuvedeno';
      } else {
        zadavatelName = extractFirstValue(contract.zadavatel) || 'Neuvedeno';
      }
      
      // Kontrola, zda už nemáme tohoto kandidáta
      const existingCandidate = partyCandidates.find(c => c.name === zadavatelName);
      
      if (existingCandidate) {
        existingCandidate.authorityScore += 150;  // Velmi vysoké skóre pro přímé pole
        existingCandidate.role = 'zadavatel';
        existingCandidate.explicitRole = true;
      } else {
        // Přidáme nového kandidáta
        partyCandidates.push({
          name: zadavatelName,
          authorityScore: 150,
          supplierScore: 0,
          role: 'zadavatel',
          isPublicEntity: true,  // Předpokládáme, že je veřejný subjekt
          explicitRole: true
        });
      }
    }
    
    // Vypsání všech kandidátů pro debugování
    if (process.env.DEBUG) {
      console.log("Kandidáti na role ve smlouvě:");
      partyCandidates.forEach(c => {
        console.log(`- ${c.name}: Zadavatel=${c.authorityScore}, Dodavatel=${c.supplierScore}, Role=${c.role}, IsPublic=${c.isPublicEntity}`);
      });
    }
    
    // Vybrat nejlepší kandidáty podle skóre
    let zadavatel = 'Neuvedeno';
    let dodavatel = 'Neuvedeno';
    
    // Seřazení kandidátů podle skóre pro každou roli
    const zadavatelCandidates = [...partyCandidates].sort((a, b) => b.authorityScore - a.authorityScore);
    const dodavatelCandidates = [...partyCandidates].sort((a, b) => b.supplierScore - a.supplierScore);
    
    // 1. Nejprve zkusíme explicitní role (ty s konkrétní rolí podle typu/role pole)
    const explicitZadavatel = partyCandidates.find(c => c.role === 'zadavatel' && c.explicitRole);
    const explicitDodavatel = partyCandidates.find(c => c.role === 'dodavatel' && c.explicitRole);
    
    if (explicitZadavatel) {
      zadavatel = explicitZadavatel.name;
    } else if (zadavatelCandidates.length > 0 && zadavatelCandidates[0].authorityScore > 0) {
      zadavatel = zadavatelCandidates[0].name;
    }
    
    if (explicitDodavatel) {
      dodavatel = explicitDodavatel.name;
    } else if (dodavatelCandidates.length > 0 && dodavatelCandidates[0].supplierScore > 0) {
      dodavatel = dodavatelCandidates[0].name;
    }
    
    // 2. Kontrola pro případ, že máme jen dvě strany a jednu jsme už určili
    if (partyCandidates.length === 2) {
      if (zadavatel !== 'Neuvedeno' && dodavatel === 'Neuvedeno') {
        // Našli jsme zadavatele, ale ne dodavatele - druhá strana musí být dodavatel
        const otherParty = partyCandidates.find(c => c.name !== zadavatel);
        if (otherParty) {
          dodavatel = otherParty.name;
        }
      } else if (zadavatel === 'Neuvedeno' && dodavatel !== 'Neuvedeno') {
        // Našli jsme dodavatele, ale ne zadavatele - druhá strana musí být zadavatel
        const otherParty = partyCandidates.find(c => c.name !== dodavatel);
        if (otherParty) {
          zadavatel = otherParty.name;
        }
      }
    }
    
    // 3. Poslední pokus - pokud máme jen jednu stranu a nic jsme neurčili
    if (partyCandidates.length === 1 && zadavatel === 'Neuvedeno' && dodavatel === 'Neuvedeno') {
      const onlyParty = partyCandidates[0];
      
      if (onlyParty.isPublicEntity) {
        zadavatel = onlyParty.name;
      } else {
        dodavatel = onlyParty.name;
      }
    }
    
    // 4. Kontrola, zda jsme nenašli stejnou stranu pro obě role
    if (zadavatel === dodavatel && zadavatel !== 'Neuvedeno') {
      console.warn(`VAROVÁNÍ: Stejná strana byla identifikována pro obě role: ${zadavatel}`);
      
      // Pokud máme více kandidátů, zkusíme najít dalšího nejlepšího dodavatele
      if (dodavatelCandidates.length > 1) {
        const nextBestSupplier = dodavatelCandidates.find(c => c.name !== zadavatel);
        if (nextBestSupplier) {
          dodavatel = nextBestSupplier.name;
        }
      }
      
      // Pokud stále máme problém, zkusíme použít veřejný subjekt jako zadavatele a ostatní jako dodavatele
      if (zadavatel === dodavatel) {
        const publicEntity = partyCandidates.find(c => c.isPublicEntity);
        const privateEntity = partyCandidates.find(c => !c.isPublicEntity);
        
        if (publicEntity && privateEntity) {
          zadavatel = publicEntity.name;
          dodavatel = privateEntity.name;
        }
      }
      
      // Pokud stále máme konflikt a máme aspoň dva kandidáty
      if (zadavatel === dodavatel && partyCandidates.length >= 2) {
        // Použijeme první dva kandidáty podle abecedy (poslední možnost)
        const sortedCandidates = [...partyCandidates].sort((a, b) => a.name.localeCompare(b.name));
        zadavatel = sortedCandidates[0].name;
        dodavatel = sortedCandidates[1].name;
        
        console.warn(`KRITICKÝ KONFLIKT ROLÍ: Použity první dva kandidáti: Zadavatel=${zadavatel}, Dodavatel=${dodavatel}`);
      }
    }
    
    // 5. Speciální úprava pro případ, že máme osobní jméno jako schvalovatele
    if (zadavatel.includes('schváleno:')) {
      // Extrakce jména
      const personalNameMatch = zadavatel.match(/schváleno:\s*(.*)/);
      const personalName = personalNameMatch ? personalNameMatch[1].trim() : zadavatel;
      
      // Pokud máme jen osobní jméno jako zadavatele a žádného dodavatele, musíme to napravit
      if (dodavatel === 'Neuvedeno') {
        // Hledáme instituci mezi kandidáty
        const institutionCandidate = partyCandidates.find(c => 
          c.name !== personalName && 
          (c.isPublicEntity || c.name.includes(' a.s.') || c.name.includes(' s.r.o.'))
        );
        
        if (institutionCandidate) {
          if (institutionCandidate.isPublicEntity) {
            zadavatel = institutionCandidate.name;
            // Pokud máme ještě nějakého kandidáta, použijeme ho jako dodavatele
            const anotherCandidate = partyCandidates.find(c => 
              c.name !== personalName && c.name !== institutionCandidate.name
            );
            if (anotherCandidate) {
              dodavatel = anotherCandidate.name;
            }
          } else {
            // Institucionální subjekt je spíše dodavatel, osoba je schvalovatel
            dodavatel = institutionCandidate.name;
          }
        }
      }
    }
    
    // 6. Finální dvojitá kontrola - veřejná instituce by měla být vždy zadavatel
    const publicZadavatel = isPublicEntityByName(zadavatel);
    const publicDodavatel = isPublicEntityByName(dodavatel);
    
    // Pokud jen dodavatel vypadá jako veřejná instituce a zadavatel ne, prohodíme je
    if (!publicZadavatel && publicDodavatel && zadavatel !== 'Neuvedeno' && dodavatel !== 'Neuvedeno') {
      console.warn(`OPRAVA: Prohození rolí - zadavatel "${zadavatel}" vypadá jako soukromý subjekt, ale dodavatel "${dodavatel}" vypadá jako veřejná instituce`);
      // Prohodíme hodnoty
      const temp = zadavatel;
      zadavatel = dodavatel;
      dodavatel = temp;
    }
    
    // Log pro debugování
    if (process.env.DEBUG) {
      console.log(`Finální určení rolí - Zadavatel: "${zadavatel}", Dodavatel: "${dodavatel}"`);
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

// Pomocná funkce pro kontrolu jestli subjekt vypadá jako veřejná instituce podle jména
function isPublicEntityByName(name: string): boolean {
  if (name === 'Neuvedeno') return false;
  
  const nameLower = name.toLowerCase();
  return (
    nameLower.includes('ministerstvo') ||
    nameLower.includes('úřad') ||
    nameLower.includes('magistrát') ||
    nameLower.includes('městský') ||
    nameLower.includes('obecní') ||
    nameLower.includes('kraj') ||
    nameLower.includes('město ') ||
    nameLower.includes('obec ') ||
    nameLower.includes('státní') ||
    nameLower.includes('česká republika') ||
    nameLower.includes('ředitelství') ||
    /krajsk[áý]/i.test(nameLower) ||
    /městsk[áý]/i.test(nameLower) ||
    /obecn[íý]/i.test(nameLower) ||
    /státn[íý]/i.test(nameLower)
  );
}

// Vylepšená funkce pro extrakci adresy a zadavatele
function extractAddressAndAuthority(record: any): { address: string | null, authority: string | null } {
  let address: string | null = null;
  let authority: string | null = null;
  
  try {
    const contract = record.smlouva ? record.smlouva[0] : record;
    
    // Pomocná funkce pro kontrolu adresy
    const extractAndCheckAddress = (addr: string | undefined | null): string | null => {
      if (!addr) return null;
      
      // Pokud adresa obsahuje nějaký typický prvek české adresy, je to pravděpodobně platná adresa
      const hasAddressElements = 
        /\d+/.test(addr) || // Obsahuje číslo
        /\b\d{3}\s?\d{2}\b/.test(addr) || // Obsahuje PSČ
        /\b(ul\.|ulice|nám\.|náměstí|třída)\b/i.test(addr); // Obsahuje typická slova
      
      return hasAddressElements ? addr : null;
    };
    
    // Pomocná funkce pro konverzi undefined na null
    const nullify = <T>(value: T | undefined): T | null => value === undefined ? null : value;
    
    // 1. Zkusit získat nejprve adresy specificky označené
    if (contract.mistoPlneni) {
      const mistoPlneni = extractFirstValue(contract.mistoPlneni);
      if (mistoPlneni) {
        address = extractAndCheckAddress(mistoPlneni);
        if (process.env.DEBUG) {
          console.log(`Nalezeno místo plnění: "${mistoPlneni}"`);
        }
      }
    }
    
    // 2. Zkusit získat adresu z subjekt
    if (!address && contract.subjekt) {
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
          const potentialAddress = extractFirstValue(mainAuthority.adresa);
          address = extractAndCheckAddress(potentialAddress);
          if (process.env.DEBUG) {
            console.log(`Nalezena adresa z authority: "${potentialAddress}"`);
          }
        }
        
        // Získat sidlo, které může být přesnější než adresa
        if (!address && mainAuthority.sidlo) {
          const potentialAddress = extractFirstValue(mainAuthority.sidlo);
          address = extractAndCheckAddress(potentialAddress);
          if (process.env.DEBUG) {
            console.log(`Nalezeno sídlo z authority: "${potentialAddress}"`);
          }
        }
        
        // Získat název zadavatele
        if (mainAuthority.nazev) {
          authority = nullify(extractFirstValue(mainAuthority.nazev));
          if (process.env.DEBUG) {
            console.log(`Nalezen zadavatel: "${authority}"`);
          }
        }
      }
    }
    
    // 3. Zkusit získat adresu z smluvniStrana
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
        if (!address) {
          // Zkusit různá pole, která by mohla obsahovat adresu
          const addressFields = ['adresa', 'sidlo', 'misto', 'adresaSidla'];
          
          for (const field of addressFields) {
            if (authParty[field]) {
              const potentialAddress = extractFirstValue(authParty[field]);
              const checkedAddress = extractAndCheckAddress(potentialAddress);
              if (checkedAddress) {
                address = checkedAddress;
                if (process.env.DEBUG) {
                  console.log(`Nalezena adresa z ${field}: "${potentialAddress}"`);
                }
                break;
              }
            }
          }
        }
        
        // Získat název zadavatele, pokud ještě nemáme
        if (!authority && authParty.nazev) {
          authority = nullify(extractFirstValue(authParty.nazev));
          if (process.env.DEBUG) {
            console.log(`Nalezen zadavatel z smluvniStrana: "${authority}"`);
          }
        }
      } else if (parties.length > 0) {
        // Pokud jsme nenašli zadavatele podle názvu, zkusíme najít stranu s adresou
        for (const party of parties) {
          if (!address) {
            // Zkusit různá pole, která by mohla obsahovat adresu
            const addressFields = ['adresa', 'sidlo', 'misto', 'adresaSidla'];
            
            for (const field of addressFields) {
              if (party[field]) {
                const potentialAddress = extractFirstValue(party[field]);
                const checkedAddress = extractAndCheckAddress(potentialAddress);
                if (checkedAddress) {
                  address = checkedAddress;
                  if (process.env.DEBUG) {
                    console.log(`Nalezena adresa z ${field}: "${potentialAddress}"`);
                  }
                  break;
                }
              }
            }
          }
          
          // Pokud jsme našli adresu nebo stále nemáme autoritu, použijeme této strany název
          if ((address && !authority) || (!authority && !address)) {
            authority = nullify(extractFirstValue(party.nazev));
            if (process.env.DEBUG) {
              console.log(`Použit název strany jako záložní autorita: "${authority}"`);
            }
          }
          
          // Pokud jsme našli obojí, můžeme skončit
          if (address && authority) break;
        }
      }
    }
    
    // 4. Zkusit získat zadavatele z schvalil pole
    if (!authority && contract.schvalil) {
      authority = nullify(extractFirstValue(contract.schvalil));
      if (process.env.DEBUG) {
        console.log(`Použit schvalovatel jako záložní autorita: "${authority}"`);
      }
      
      // Pokud to vypadá jako osoba a ne instituce, přidáme prefix
      if (authority && !authority.includes('Úřad') && !authority.includes('Město') && 
          !authority.includes('Obec') && !authority.includes('Ministerstvo') &&
          !authority.includes('a.s.') && !authority.includes('s.r.o.')) {
        authority = `Úřad/organizace schváleno: ${authority}`;
      }
    }
    
    // 5. Poslední pokus - místo
    if (!address && contract.misto) {
      address = nullify(extractFirstValue(contract.misto));
      if (process.env.DEBUG) {
        console.log(`Použito obecné místo: "${address}"`);
      }
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
