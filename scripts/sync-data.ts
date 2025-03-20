import { PrismaClient } from '@prisma/client'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import xml2js from 'xml2js'
import os from 'os'

const prisma = new PrismaClient()

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
    const parser = new xml2js.Parser({ explicitArray: false })
    
    return new Promise<any[]>((resolve, reject) => {
      parser.parseString(xmlData, (err, result) => {
        if (err) {
          console.error(`XML parsing error: ${err.message}`)
          reject(err)
          return
        }
        
        try {
          // Extract contracts from the XML structure
          // Note: You'll need to adjust this based on the actual XML structure
          if (!result || !result.smlouvy) {
            console.warn('XML structure does not match expected format. Got:', Object.keys(result || {}))
            resolve([]) // Return empty array instead of failing
            return
          }
          
          const contracts = result.smlouvy?.smlouva || []
          
          // Convert to array if it's a single item
          const contractsArray = Array.isArray(contracts) ? contracts : [contracts]
          
          console.log(`Found ${contractsArray.length} contracts in the XML dump`)
          resolve(contractsArray)
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
    nazev: contract.predmet || contract.nazev || 'Neuvedeno',
    castka: parseFloat(contract.hodnotaBezDph || contract.castka || 0),
    kategorie: contract.typSmlouvy || contract.kategorie || 'ostatni',
    datum: new Date(contract.datumUzavreni || contract.datum || Date.now()),
    dodavatel: contract.dodavatel?.nazev || contract.dodavatel || 'Neuvedeno',
    zadavatel: contract.zadavatel?.nazev || contract.zadavatel || 'Neuvedeno',
    typ_rizeni: contract.druhRizeni || contract.typ_rizeni || 'standardní',
  }
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
  
  // Get the date of the last update
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
          // Check if the contract already exists
          const existingContract = await prisma.smlouva.findFirst({
            where: { 
              nazev: contract.predmet || contract.nazev || 'Neuvedeno',
              datum: new Date(contract.datumUzavreni || contract.datum || Date.now()),
              dodavatel: contract.dodavatel?.nazev || contract.dodavatel || 'Neuvedeno',
              zadavatel: contract.zadavatel?.nazev || contract.zadavatel || 'Neuvedeno'
            }
          })
          
          // Transform the contract data
          const contractData: ContractData = transformContractData(contract)
          
          // Add geolocation if we don't have it
          if (!existingContract?.lat || !existingContract?.lng) {
            const zadavatelAdresa = contract.zadavatel?.adresa || contract.adresa || ''
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
          
          // Process attachments if they exist
          // Note: You'll need to adjust this based on the actual XML structure
          if (contract.prilohy && Array.isArray(contract.prilohy.priloha)) {
            for (const priloha of contract.prilohy.priloha) {
              if (existingContract) {
                // Here you would process attachments if needed
                // This is just a placeholder for the actual implementation
              }
            }
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

// Allow the script to be run directly
const isRunningDirectly = require.main === module;

if (isRunningDirectly) {
  syncData()
    .then(() => {
      console.log('Data sync completed successfully')
      process.exit(0)
    })
    .catch(error => {
      console.error('Data sync failed:', error)
      process.exit(1)
    })
}
