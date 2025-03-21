import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import xml2js from 'xml2js';
import os from 'os';

// Nastavení cesty pro dočasné soubory
const TEMP_DIR = path.join(os.tmpdir(), 'smlouvy-dumps');

// Vytvoření dočasné složky, pokud neexistuje
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Zkontroluje, zda již existuje stažený XML soubor
 */
function findExistingXmlFile(): string | null {
  console.log(`Hledám existující XML soubory v: ${TEMP_DIR}`);
  
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const xmlFiles = files.filter(file => file.endsWith('.xml') && file.startsWith('dump_'));
    
    if (xmlFiles.length > 0) {
      const filePath = path.join(TEMP_DIR, xmlFiles[0]);
      console.log(`Nalezen existující soubor: ${filePath}`);
      return filePath;
    }
    
    console.log('Žádný existující XML soubor nebyl nalezen');
    return null;
  } catch (error) {
    console.error('Chyba při hledání existujících souborů:', error);
    return null;
  }
}

/**
 * Stáhne XML soubor s daty smluv pro daný rok a měsíc
 */
async function downloadXmlDump(year: number, month: number): Promise<string> {
  const monthFormatted = month.toString().padStart(2, '0');
  const fileName = `dump_${year}_${monthFormatted}.xml`;
  const url = `https://data.smlouvy.gov.cz/${fileName}`;
  
  console.log(`Stahuji data z: ${url}`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Nepodařilo se stáhnout soubor: ${response.status} ${response.statusText}`);
    }
    
    const filePath = path.join(TEMP_DIR, fileName);
    const fileStream = fs.createWriteStream(filePath);
    
    return new Promise((resolve, reject) => {
      if (!response.body) {
        reject(new Error('Response body je null'));
        return;
      }
      
      response.body.pipe(fileStream);
      response.body.on('error', (err) => {
        reject(err);
      });
      fileStream.on('finish', () => {
        console.log(`Soubor stažen do: ${filePath}`);
        resolve(filePath);
      });
    });
  } catch (error) {
    console.error(`Chyba při stahování dat pro ${year}-${monthFormatted}:`, error);
    throw error;
  }
}

/**
 * Analyzuje strukturu XML souboru a vytvoří přehled
 */
async function analyzeXmlStructure(filePath: string) {
  console.log(`Analyzuji XML soubor: ${filePath}`);
  
  try {
    // Načtení XML souboru
    const xmlData = fs.readFileSync(filePath, 'utf8');
    console.log(`Soubor úspěšně načten. Velikost: ${xmlData.length} bajtů`);
    
    // Parsování XML
    const parser = new xml2js.Parser({ explicitArray: true });
    
    // Analyzovat XML a vytisknout strukturu
    const result = await parser.parseStringPromise(xmlData);
    
    // Získat strukturu kořenových elementů
    console.log('\n===== STRUKTURA XML =====');
    console.log('Kořenové elementy:', Object.keys(result));
    
    // Analyzovat smlouvy
    let contracts = [];
    let recordsPath = '';
    
    // Vyhledat v různých možných cestách
    if (result.dump && result.dump.zaznam) {
      contracts = result.dump.zaznam;
      recordsPath = 'dump.zaznam';
    } else if (result.dump && result.dump.smlouva) {
      contracts = result.dump.smlouva;
      recordsPath = 'dump.smlouva';
    } else if (result.dump && result.dump.smlouvy && result.dump.smlouvy[0] && result.dump.smlouvy[0].smlouva) {
      contracts = result.dump.smlouvy[0].smlouva;
      recordsPath = 'dump.smlouvy[0].smlouva';
    } else if (result.smlouvy && result.smlouvy.smlouva) {
      contracts = result.smlouvy.smlouva;
      recordsPath = 'smlouvy.smlouva';
    } else {
      console.log('Nepodařilo se najít smlouvy ve struktuře XML');
      return;
    }
    
    console.log(`\nNalezeno ${contracts.length} smluv v cestě: ${recordsPath}`);
    
    // Analyzovat první smlouvu
    if (contracts.length > 0) {
      const firstContract = contracts[0];
      
      // Zjistit, zda je smlouva uvnitř záznamu nebo přímo
      const contractData = firstContract.smlouva ? firstContract.smlouva[0] : firstContract;
      
      console.log('\n===== STRUKTURA PRVNÍ SMLOUVY =====');
      console.log('Klíče:', Object.keys(contractData));
      
      // Analýza dodavatelů
      console.log('\n===== ANALÝZA DODAVATELŮ =====');
      
      if (contractData.subjekt) {
        console.log('Nalezen element "subjekt":', contractData.subjekt.length, 'záznamů');
        
        // Vypíšeme strukturu prvního subjektu
        if (contractData.subjekt.length > 0) {
          console.log('Klíče prvního subjektu:', Object.keys(contractData.subjekt[0]));
          
          // Pokud má subjekt typ, vypíšeme možné hodnoty typu
          if (contractData.subjekt[0].typ) {
            const types = contractData.subjekt.map((s: any) => s.typ && s.typ[0]);
            console.log('Typy subjektů:', [...new Set(types)]);
            
            // Najít dodavatele mezi subjekty
            const suppliers = contractData.subjekt.filter((s: any) => {
              if (!s.typ) return false;
              const typValue = s.typ[0];
              return typValue ? typValue.toString().toLowerCase().includes('dodavatel') : false;
            });
            
            if (suppliers.length > 0) {
              console.log(`\nNalezeno ${suppliers.length} dodavatelů mezi subjekty`);
              console.log('První dodavatel:', JSON.stringify(suppliers[0], null, 2));
            } else {
              console.log('\nŽádní dodavatelé nebyli nalezeni mezi subjekty');
            }
          }
        }
      } else if (contractData.dodavatel) {
        console.log('Nalezen přímý element "dodavatel"');
        console.log('Struktura elementu dodavatel:', JSON.stringify(contractData.dodavatel, null, 2));
      } else {
        console.log('Žádný element typu dodavatel nebyl nalezen');
      }
      
      // Analýza smluvních stran (alternativní přístup)
      if (contractData.smluvniStrana) {
        console.log('\n===== ANALÝZA SMLUVNÍCH STRAN =====');
        console.log('Nalezen element "smluvniStrana":', contractData.smluvniStrana.length, 'záznamů');
        
        if (contractData.smluvniStrana.length > 0) {
          console.log('Klíče první smluvní strany:', Object.keys(contractData.smluvniStrana[0]));
        }
      }
      
      // Procházet několik prvních smluv a analyzovat jak se liší dodavatelé
      console.log('\n===== ANALÝZA DODAVATELŮ V PRVNÍCH 5 SMLOUVÁCH =====');
      const sampleSize = Math.min(5, contracts.length);
      
      for (let i = 0; i < sampleSize; i++) {
        const contract = contracts[i];
        const contractData = contract.smlouva ? contract.smlouva[0] : contract;
        
        console.log(`\nSmlouva #${i+1}:`);
        
        // Zkontrolovat, jestli existuje element subjekt
        if (contractData.subjekt) {
          const suppliers = contractData.subjekt.filter((s: any) => {
            if (!s.typ) return false;
            const typValue = s.typ[0];
            return typValue ? typValue.toString().toLowerCase().includes('dodavatel') : false;
          });
          
          if (suppliers.length > 0) {
            for (let j = 0; j < suppliers.length; j++) {
              const supplier = suppliers[j];
              console.log(`  Dodavatel #${j+1}:`);
              console.log(`    Název: ${supplier.nazev ? supplier.nazev[0] : 'N/A'}`);
              console.log(`    IČO: ${supplier.ico ? supplier.ico[0] : 'N/A'}`);
              console.log(`    Typ: ${supplier.typ ? supplier.typ[0] : 'N/A'}`);
            }
          } else {
            console.log('  Žádný dodavatel nenalezen v elementu "subjekt"');
          }
        } else if (contractData.dodavatel) {
          console.log('  Přímý element "dodavatel":');
          
          if (typeof contractData.dodavatel[0] === 'object') {
            console.log(`    Název: ${contractData.dodavatel[0].nazev ? contractData.dodavatel[0].nazev[0] : 'N/A'}`);
            console.log(`    IČO: ${contractData.dodavatel[0].ico ? contractData.dodavatel[0].ico[0] : 'N/A'}`);
          } else {
            console.log(`    Hodnota: ${contractData.dodavatel[0]}`);
          }
        } else {
          console.log('  Žádný element typu dodavatel nebyl nalezen');
        }
      }
    } else {
      console.log('Žádné smlouvy nebyly nalezeny v souboru');
    }
    
  } catch (error) {
    console.error(`Chyba při analýze XML souboru:`, error);
  }
}

/**
 * Hlavní funkce pro analýzu XML souboru
 */
async function analyzeXml() {
  try {
    // Nejprve zkontrolovat, zda již máme stažený soubor
    let filePath = findExistingXmlFile();
    
    // Pokud ne, stáhnout nový
    if (!filePath) {
      // Získat aktuální rok a měsíc
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      
      // Stáhnout XML soubor s aktuálními daty
      filePath = await downloadXmlDump(currentYear, currentMonth);
    }
    
    // Analyzovat strukturu XML
    await analyzeXmlStructure(filePath);
    
    console.log('\nAnalýza dokončena!');
  } catch (error) {
    console.error('Chyba při analýze XML:', error);
  }
}

// Spustit analýzu
analyzeXml()
  .then(() => {
    console.log('Analýza XML dokončena');
  })
  .catch(error => {
    console.error('Analýza XML selhala:', error);
    process.exit(1);
  });
