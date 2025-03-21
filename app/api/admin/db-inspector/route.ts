import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Gets sample data from a specified table
 */
async function getSampleData(tableName: string, limit: number = 10) {
  try {
    const query = `SELECT * FROM "${tableName}" LIMIT ${limit}`;
    const result = await prisma.$queryRawUnsafe(query);
    return result;
  } catch (error) {
    console.error(`Error getting sample data from ${tableName}:`, error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Clears mock data and resets auto-increment sequences
 */
async function clearMockData(tableNames: string[]) {
  const results = [];
  
  try {
    // For each table, delete data and reset sequence
    for (const tableName of tableNames) {
      try {
        // Delete all data
        const deleteQuery = `DELETE FROM "${tableName}"`;
        await prisma.$executeRawUnsafe(deleteQuery);
        
        // Reset sequence if it exists (for tables with auto-increment)
        try {
          // First check if the sequence exists
          const sequenceCheckQuery = `
            SELECT EXISTS (
              SELECT FROM pg_sequences 
              WHERE schemaname = 'public' 
              AND sequencename = '${tableName}_id_seq'
            ) as exists
          `;
          const sequenceExists = await prisma.$queryRawUnsafe(sequenceCheckQuery);
          
          if (sequenceExists[0]?.exists) {
            const resetSequenceQuery = `ALTER SEQUENCE "${tableName}_id_seq" RESTART WITH 1`;
            await prisma.$executeRawUnsafe(resetSequenceQuery);
          }
        } catch (seqError) {
          // If there's an error with sequence, just log it but continue
          console.warn(`Could not reset sequence for ${tableName}:`, seqError);
        }
        
        results.push({
          table: tableName,
          success: true,
          message: `Data cleared successfully`
        });
      } catch (tableError) {
        results.push({
          table: tableName, 
          success: false,
          error: tableError instanceof Error ? tableError.message : String(tableError)
        });
      }
    }
    
    return {
      success: results.every(r => r.success),
      results
    };
  } catch (error) {
    console.error('Error clearing mock data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Inserts a batch of sample records for testing
 */
async function insertSampleRecords() {
  try {
    // Insert a test dodavatel
    await prisma.$executeRawUnsafe(`
      INSERT INTO "dodavatel" ("nazev", "ico", "datum_zalozeni", "pocet_zamestnancu", "created_at", "updated_at")
      VALUES ('Test Dodavatel s.r.o.', '12345678', CURRENT_TIMESTAMP, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    // Insert a test smlouva
    await prisma.$executeRawUnsafe(`
      INSERT INTO "smlouva" ("nazev", "castka", "kategorie", "datum", "dodavatel", "zadavatel", "typ_rizeni", "created_at", "updated_at")
      VALUES ('Testovací smlouva', 1000000, 'test', CURRENT_TIMESTAMP, 'Test Dodavatel s.r.o.', 'Test Zadavatel', 'standardní', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    // Get the created smlouva ID
    const smlouvaResult = await prisma.$queryRawUnsafe(`
      SELECT id FROM "smlouva" WHERE "nazev" = 'Testovací smlouva' LIMIT 1
    `);
    const smlouvaId = smlouvaResult[0]?.id;
    
    if (smlouvaId) {
      // Insert a test dodatek
      await prisma.$executeRawUnsafe(`
        INSERT INTO "dodatek" ("smlouva_id", "castka", "datum", "created_at")
        VALUES (${smlouvaId}, 200000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      
      // Insert a test podnet
      await prisma.$executeRawUnsafe(`
        INSERT INTO "podnet" ("jmeno", "email", "smlouva_id", "zprava", "created_at")
        VALUES ('Test Uživatel', 'test@example.com', ${smlouvaId}, 'Testovací podnět', CURRENT_TIMESTAMP)
      `);
    }
    
    return {
      success: true,
      message: 'Sample data inserted successfully',
      smlouvaId
    };
  } catch (error) {
    console.error('Error inserting sample records:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Endpoint to check database content and potentially fix issues
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'inspect';
  const table = url.searchParams.get('table') || 'smlouva';
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);
  
  try {
    if (mode === 'sample') {
      const sampleData = await getSampleData(table, limit);
      return NextResponse.json({ table, data: sampleData });
    }
    
    // Get data from all relevant tables
    const smlouvaData = await getSampleData('smlouva', limit);
    const dodavatelData = await getSampleData('dodavatel', limit);
    const dodatekData = await getSampleData('dodatek', limit);
    const podnetData = await getSampleData('podnet', limit);
    
    return NextResponse.json({
      tables: {
        smlouva: {
          name: 'smlouva',
          count: Array.isArray(smlouvaData) ? smlouvaData.length : 0,
          data: smlouvaData
        },
        dodavatel: {
          name: 'dodavatel',
          count: Array.isArray(dodavatelData) ? dodavatelData.length : 0,
          data: dodavatelData
        },
        dodatek: {
          name: 'dodatek',
          count: Array.isArray(dodatekData) ? dodatekData.length : 0,
          data: dodatekData
        },
        podnet: {
          name: 'podnet',
          count: Array.isArray(podnetData) ? podnetData.length : 0,
          data: podnetData
        }
      }
    });
  } catch (error) {
    console.error('Error in GET handler:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'clear';
    
    if (mode === 'clear') {
      // Clear all tables and reset sequences
      const clearResult = await clearMockData(['smlouva', 'dodavatel', 'dodatek', 'podnet']);
      return NextResponse.json(clearResult);
    } else if (mode === 'sample') {
      // Insert sample test data
      const sampleResult = await insertSampleRecords();
      return NextResponse.json(sampleResult);
    } else if (mode === 'custom') {
      // Process custom data insertion from request body
      const data = await request.json();
      
      // TODO: Implement custom data insertion logic
      return NextResponse.json({
        success: false,
        message: 'Custom data insertion not yet implemented',
        receivedData: data
      });
    }
    
    return NextResponse.json({
      success: false,
      message: `Unknown mode: ${mode}`
    }, { status: 400 });
  } catch (error) {
    console.error('Error in POST handler:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
