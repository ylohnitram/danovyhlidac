import { PrismaClient } from '@prisma/client'
import fetch from 'node-fetch'

const prisma = new PrismaClient()

// Funkce pro získání dat z Registru smluv
async function fetchContractsFromRegistry(offset = 0, limit = 100) {
  try {
    // Aktuální datum pro filtrování
    const today = new Date()
    // Výchozí: data za poslední měsíc
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
    
    const url = new URL('https://smlouvy.gov.cz/api/v2/smlouvy')
    url.searchParams.append('limit', limit.toString())
    url.searchParams.append('offset', offset.toString())
    url.searchParams.append('datumUzavreniOd', lastMonth.toISOString().split('T')[0])
    
    console.log(`Fetching data from: ${url.toString()}`)
    
    const response = await fetch(url.toString())
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error fetching data from registry:', error)
    throw error
  }
}

// Funkce pro transformaci dat do formátu naší databáze
function transformContractData(data: any) {
  return {
    nazev: data.predmet || 'Neuvedeno',
    castka: data.hodnotaBezDph || 0,
    kategorie: data.typSmlouvy || 'ostatni',
    datum: new Date(data.datumUzavreni),
    dodavatel: data.dodavatel?.nazev || 'Neuvedeno',
    zadavatel: data.zadavatel?.nazev || 'Neuvedeno',
    typ_rizeni: data.druhRizeni || 'standardní',
  }
}

// Funkce pro transformaci dat dodavatelů
function transformSupplierData(data: any) {
  if (!data?.dodavatel?.ico) return null
  
  return {
    nazev: data.dodavatel.nazev,
    ico: data.dodavatel.ico,
    datum_zalozeni: new Date(data.dodavatel.datumVzniku || Date.now()),
    pocet_zamestnancu: data.dodavatel.pocetZamestnancu || null,
  }
}

// Pokusí se geokódovat adresu zadavatele (zjednodušená implementace)
async function geocodeAddress(address: string) {
  try {
    // Zde by bylo volání geokódovací služby jako Google Maps, Mapbox atd.
    // Pro účely ukázky vrátíme náhodné souřadnice v ČR
    return {
      lat: 49.8 + (Math.random() - 0.5) * 2,
      lng: 15.5 + (Math.random() - 0.5) * 4
    }
  } catch (error) {
    console.error(`Error geocoding address: ${address}`, error)
    return null
  }
}

// Hlavní synchronizační funkce
export async function syncData() {
  console.log('Starting data synchronization...')
  const startTime = Date.now()
  
  // Získáme datum poslední aktualizace
  const lastSync = await prisma.smlouva.findFirst({
    orderBy: { updated_at: 'desc' },
    select: { updated_at: true }
  })
  
  const lastSyncDate = lastSync?.updated_at || new Date(0)
  console.log(`Last sync date: ${lastSyncDate.toISOString()}`)
  
  let offset = 0
  const limit = 100
  let hasMoreData = true
  let processedCount = 0
  let newCount = 0
  let updatedCount = 0
  let errorCount = 0
  
  // Procházíme stránky dat, dokud existují
  while (hasMoreData) {
    try {
      const data = await fetchContractsFromRegistry(offset, limit)
      const contracts = data.items || []
      
      if (contracts.length === 0) {
        hasMoreData = false
        break
      }
      
      console.log(`Processing ${contracts.length} contracts from offset ${offset}...`)
      
      // Zpracujeme každou smlouvu
      for (const contract of contracts) {
        processedCount++
        
        try {
          // Zkontrolujeme, zda smlouva již existuje
          const existingContract = await prisma.smlouva.findFirst({
            where: { 
              nazev: contract.predmet || 'Neuvedeno',
              datum: new Date(contract.datumUzavreni),
              dodavatel: contract.dodavatel?.nazev || 'Neuvedeno',
              zadavatel: contract.zadavatel?.nazev || 'Neuvedeno'
            }
          })
          
          // Základní data smlouvy
          const contractData = transformContractData(contract)
          
          // Přidáme geolokaci, pokud nemáme
          if (!existingContract?.lat || !existingContract?.lng) {
            const zadavatelAdresa = contract.zadavatel?.adresa || ''
            if (zadavatelAdresa) {
              const geoData = await geocodeAddress(zadavatelAdresa)
              if (geoData) {
                contractData.lat = geoData.lat
                contractData.lng = geoData.lng
              }
            }
          }
          
          // Zpracování dodavatele, pokud existuje
          if (contract.dodavatel?.ico) {
            const supplierData = transformSupplierData(contract)
            if (supplierData) {
              await prisma.dodavatel.upsert({
                where: { ico: supplierData.ico },
                update: supplierData,
                create: supplierData
              })
            }
          }
          
          // Vytvoření nebo aktualizace smlouvy
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
          
          // Zpracování dodatků, pokud existují
          if (contract.dodatky && Array.isArray(contract.dodatky)) {
            for (const dodatek of contract.dodatky) {
              if (existingContract) {
                await prisma.dodatek.upsert({
                  where: {
                    id: dodatek.id || 0
                  },
                  update: {
                    castka: dodatek.castka || 0,
                    datum: new Date(dodatek.datum || Date.now())
                  },
                  create: {
                    smlouva_id: existingContract.id,
                    castka: dodatek.castka || 0,
                    datum: new Date(dodatek.datum || Date.now())
                  }
                })
              }
            }
          }
        } catch (itemError) {
          console.error(`Error processing contract: ${contract.id}`, itemError)
          errorCount++
          // Pokračujeme dalším kontraktem
          continue
        }
      }
      
      offset += contracts.length
      
      // Pauza mezi požadavky, aby se nezahltilo API
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      console.error(`Error processing batch at offset ${offset}:`, error)
      errorCount++
      // Pokračujeme dalším batchem i v případě chyby
      offset += limit
    }
    
    // Omezení maximálního počtu stránek pro demo
    if (offset > 300) {
      console.log('Reached maximum offset for demo, stopping...')
      hasMoreData = false
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

// Pro možnost spustit skript přímo
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
}
