import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import xml2js from 'xml2js'
import { PrismaClient } from '@prisma/client'
import os from 'os'

const prisma = new PrismaClient()
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
          // Inspect the actual XML structure for debugging
          console.log('XML structure root elements:', Object.keys(result || {}))
          
          // Check if 'dump' is the root element instead of 'smlouvy'
          if (!result) {
            console.warn('Result is undefined or null')
            resolve([])
            return
          }
          
          if (result.dump) {
            console.log('Found dump as root element. Checking its properties:', Object.keys(result.dump))
            
            // If 'dump' contains 'smlouva' elements directly
            if (result.dump.smlouva) {
              const contracts = result.dump.smlouva
              const contractsArray = Array.isArray(contracts) ? contracts : [contracts]
              console.log(`Found ${contractsArray.length} contracts in the XML dump under dump.smlouva`)
              resolve(contractsArray)
              return
            }
            
            // If 'dump' contains 'smlouvy' which contains 'smlouva'
            if (result.dump.smlouvy) {
              console.log('Found smlouvy under dump. Checking its properties:', Object.keys(result.dump.smlouvy[0] || {}))
              const contracts = result.dump.smlouvy[0]?.smlouva || []
              const contractsArray = Array.isArray(contracts) ? contracts : [contracts]
              console.log(`Found ${contractsArray.length} contracts in the XML dump under dump.smlouvy.smlouva`)
              resolve(contractsArray)
              return
            }
            
            // Check if there are any arrays that might contain contracts
            for (const key in result.dump) {
              if (Array.isArray(result.dump[key])) {
                console.log(`Found array in dump.${key} with ${result.dump[key].length} items`)
                if (result.dump[key].length > 0) {
                  console.log(`Sample item keys:`, Object.keys(result.dump[key][0] || {}))
                }
              }
            }
            
            // Check if there's a 'zaznamy' element which might be the Czech word for 'records'
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
            // Original expected format
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
function transformContractData(contract: any): ContractData {
  // Transform the XML data to match your database schema
  // You'll need to adjust this based on the actual XML structure
  return {
    nazev: extractFirstValue(contract.predmet) || extractFirstValue(contract.nazev) || 'Neuvedeno',
    castka: parseFloat(extractFirstValue(contract.hodnotaBezDph) || extractFirstValue(contract.castka) || '0'),
    kategorie: extractFirstValue(contract.typSmlouvy) || extractFirstValue(contract.kategorie) || 'ostatni',
    datum: new Date(extractFirstValue(contract.datumUzavreni) || extractFirstValue(contract.datum) || Date.now()),
    dodavatel: extractFirstValue(contract.dodavatel?.[0]?.nazev) || extractFirstValue(contract.dodavatel) || 'Neuvedeno',
    zadavatel: extractFirstValue(contract.zadavatel?.[0]?.nazev) || extractFirstValue(contract.zadavatel) || 'Neuvedeno',
    typ_rizeni: extractFirstValue(contract.druhRizeni) || extractFirstValue(contract.typ_rizeni) || 'standardní',
  }
}

// Helper function to extract the first value from an array or return undefined
function extractFirstValue(value: any): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.toString();
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

// Main synchronization function
export async function syncData() {
  console.log('Starting data synchronization from open data dumps...')
  const startTime = Date.now()
  
  // Get the date of the last update - using updated_at from a Smlouva record
  const lastSync = await prisma.smlouva.findFirst({
    orderBy: { updated_at: 'desc' },
    select: { updated_at: true }
  })
  
  const lastSyncDate = lastSync?.updated_at || new Date(0)
  console.log(`Last sync date: ${lastSyncDate.toISOString()}`)
  
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
  
  // Process each month
  for (const { year, month } of months) {
    try {
      // Download and parse the XML dump
      const filePath = await downloadXmlDump(year, month)
      const contracts = await parseXmlDump(filePath)
      
      console.log(`Processing ${contracts.length} contracts for ${year}-${month}...`)
      
      // Process each contract
      for (const contract of contracts) {
        processedCount++
        
        try {
          // Transform the contract data
          const contractData: ContractData = transformContractData(contract)
          
          // Generate a unique identifier for the contract
          const contractIdentifier = `${contractData.nazev}-${contractData.datum.toISOString()}-${contractData.dodavatel}-${contractData.zadavatel}`.substring(0, 100)
          
          // Check if the contract already exists
          const existingContract = await prisma.smlouva.findFirst({
            where: { 
              nazev: contractData.nazev,
              datum: contractData.datum,
              dodavatel: contractData.dodavatel,
              zadavatel: contractData.zadavatel
            }
          })
          
          // Add geolocation if we don't have it
          if (!existingContract?.lat || !existingContract?.lng) {
            const zadavatelAdresa = extractFirstValue(contract.zadavatel?.[0]?.adresa) || extractFirstValue(contract.adresa) || ''
            if (zadavatelAdresa) {
              const geoData = await geocodeAddress(zadavatelAdresa)
              if (geoData) {
                contractData.lat = geoData.lat
                contractData.lng = geoData.lng
              }
            }
          }
          
          // Create or update the contract
          if (existingContract) {
            await prisma.smlouva.update({
              where: { id: existingContract.id },
              data: contractData
            })
            updatedCount++
          } else {
            await prisma.smlouva.create({ data: contractData })
            newCount++
          }
          
          // Log progress for every 100 contracts
          if (processedCount % 100 === 0) {
            console.log(`Processed ${processedCount} contracts (${newCount} new, ${updatedCount} updated)`)
          }
        } catch (itemError) {
          console.error(`Error processing contract:`, itemError)
          errorCount++
          // Continue with the next contract
          continue
        }
      }
      
      // Delay between processing months to avoid system overload
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      console.error(`Error processing data for ${year}-${month}:`, error)
      errorCount++
      // Continue with the next month
      continue
    }
  }
  
  const endTime = Date.now()
  const duration = (endTime - startTime) / 1000
  
  const summary = {
    duration: `${duration} seconds`,
    processed: processedCount,
    new: newCount,
    updated: updatedCount,
    errors: errorCount
  };
  
  console.log(`Synchronization completed in ${duration} seconds`)
  console.log(`Processed ${processedCount} contracts, added ${newCount} new, updated ${updatedCount}, errors: ${errorCount}`)
  
  return summary;
}

// Run directly if this script is executed directly
if (require.main === module) {
  syncData()
    .then(() => {
      console.log('Data sync completed successfully')
      process.exit(0)
    })
    .catch(error => {
      console.error('Data sync failed:', error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
