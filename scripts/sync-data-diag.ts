// A simplified diagnostic version of the sync-data script

import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';
import xml2js from 'xml2js';

console.log('=== SYNC-DATA DIAGNOSTIC SCRIPT ===');
console.log(`Running at: ${new Date().toISOString()}`);
console.log(`Environment: NODE_ENV=${process.env.NODE_ENV}, DEBUG=${process.env.DEBUG}`);

// Create temp dir for downloads
const TEMP_DIR = path.join(os.tmpdir(), 'smlouvy-dumps');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  console.log(`Created temporary directory: ${TEMP_DIR}`);
}

// Create the Prisma client
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

// Type for database tables
type TableRecord = {
  tablename: string;
  schemaname?: string;
};

// Define result types for better TypeScript compatibility
type TestResult = {
  success: boolean;
  error?: string;
  [key: string]: any; // Allow additional properties
};

/**
 * Test database connectivity
 */
async function testDatabase(): Promise<TestResult> {
  console.log('\n=== TESTING DATABASE CONNECTIVITY ===');
  
  try {
    // Basic connection test
    console.log('Attempting simple database query...');
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✓ Basic connectivity test passed');
    
    // Check tables
    console.log('Checking available tables...');
    const tables = await prisma.$queryRaw<TableRecord[]>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
      ORDER BY tablename
    `;
    
    console.log(`Found ${tables.length} tables in database:`);
    tables.forEach(table => console.log(`- ${table.tablename}`));
    
    // Check for expected tables
    const expectedTables = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    console.log(`Checking for expected tables: ${expectedTables.join(', ')}...`);
    
    for (const tableName of expectedTables) {
      // Check with case-insensitive query
      const query = `
        SELECT tablename FROM pg_tables 
        WHERE schemaname='public' 
        AND LOWER(tablename)=LOWER('${tableName}')
      `;
      
      const result = await prisma.$queryRawUnsafe<TableRecord[]>(query);
      
      if (Array.isArray(result) && result.length > 0) {
        console.log(`✓ Table '${tableName}' exists as '${result[0].tablename}'`);
      } else {
        console.log(`✗ Table '${tableName}' not found`);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('✗ Database test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Try downloading a small XML sample
 */
async function testDownload(): Promise<TestResult> {
  console.log('\n=== TESTING DATA DOWNLOAD ===');
  
  try {
    // Current date (or use a known good month/year)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    const monthFormatted = month.toString().padStart(2, '0');
    const fileName = `dump_${year}_${monthFormatted}.xml`;
    const url = `https://data.smlouvy.gov.cz/${fileName}`;
    const filePath = path.join(TEMP_DIR, fileName);
    
    console.log(`Testing download from URL: ${url}`);
    
    // Skip download if file exists
    if (fs.existsSync(filePath)) {
      console.log(`File already exists at: ${filePath}, skipping download`);
      const stats = fs.statSync(filePath);
      console.log(`File size: ${stats.size} bytes, Last modified: ${stats.mtime}`);
      return { success: true, filePath, skipped: true };
    }
    
    // Start download
    console.log('Starting download...');
    const startTime = Date.now();
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }
    
    // Check headers before continuing
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    
    console.log(`Response headers: content-type=${contentType}, content-length=${contentLength}`);
    
    // Create a buffer from the response
    const buffer = await response.buffer();
    console.log(`Downloaded ${buffer.length} bytes in ${(Date.now() - startTime) / 1000} seconds`);
    
    // Save to file
    fs.writeFileSync(filePath, buffer);
    console.log(`Saved to: ${filePath}`);
    
    return { success: true, filePath };
  } catch (error) {
    console.error('✗ Download test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Try parsing the XML file
 */
async function testParsing(filePath: string): Promise<TestResult> {
  console.log('\n=== TESTING XML PARSING ===');
  
  try {
    console.log(`Reading file: ${filePath}`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File doesn't exist: ${filePath}`);
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    console.log(`File loaded, size: ${data.length} bytes`);
    
    // Parse XML
    console.log('Parsing XML...');
    const parser = new xml2js.Parser({ explicitArray: true });
    
    const result = await new Promise<any>((resolve, reject) => {
      parser.parseString(data, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    console.log('XML parsing succeeded');
    
    // Check structure
    if (!result) {
      console.log('Warning: Parsed result is empty or null');
      return { success: true, empty: true };
    }
    
    console.log('XML root elements:', Object.keys(result));
    
    // Try to locate contract data
    let contractData = null;
    
    if (result.dump?.zaznam) {
      contractData = result.dump.zaznam;
      console.log(`Found ${contractData.length} contracts in dump.zaznam`);
    } else if (result.dump?.smlouva) {
      contractData = result.dump.smlouva;
      console.log(`Found ${Array.isArray(contractData) ? contractData.length : 1} contracts in dump.smlouva`);
    } else if (result.dump?.smlouvy?.[0]?.smlouva) {
      contractData = result.dump.smlouvy[0].smlouva;
      console.log(`Found ${Array.isArray(contractData) ? contractData.length : 1} contracts in dump.smlouvy[0].smlouva`);
    } else if (result.smlouvy?.smlouva) {
      contractData = result.smlouvy.smlouva;
      console.log(`Found ${Array.isArray(contractData) ? contractData.length : 1} contracts in smlouvy.smlouva`);
    } else {
      console.log('Could not locate contract data in the XML structure');
    }
    
    if (contractData && contractData.length > 0) {
      console.log('Sample of the first contract (truncated):');
      console.log(JSON.stringify(contractData[0], null, 2).substring(0, 500) + '...');
    }
    
    return { 
      success: true, 
      contractCount: contractData ? (Array.isArray(contractData) ? contractData.length : 1) : 0 
    };
  } catch (error) {
    console.error('✗ XML parsing test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
  console.log('Starting sync data diagnostics...');
  const startTime = Date.now();
  
  try {
    // 1. Test database
    const dbResult = await testDatabase();
    
    // 2. Test download (even if DB fails)
    const downloadResult = await testDownload();
    
    // 3. Test parsing (if download succeeds)
    let parsingResult: TestResult = { success: false, error: 'Parsing not attempted' };
    if (downloadResult.success && downloadResult.filePath) {
      parsingResult = await testParsing(downloadResult.filePath);
    }
    
    // 4. Summary
    console.log('\n=== DIAGNOSTIC SUMMARY ===');
    console.log(`Database test: ${dbResult.success ? 'PASSED' : 'FAILED'}`);
    console.log(`Download test: ${downloadResult.success ? 'PASSED' : 'FAILED'}`);
    console.log(`XML parsing test: ${parsingResult.success ? 'PASSED' : 'FAILED'}`);
    
    const overallSuccess = dbResult.success && downloadResult.success && parsingResult.success;
    
    return {
      success: overallSuccess,
      details: {
        database: dbResult,
        download: downloadResult,
        parsing: parsingResult
      },
      duration: `${(Date.now() - startTime) / 1000} seconds`
    };
  } catch (error) {
    console.error('Unhandled error in diagnostics:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: `${(Date.now() - startTime) / 1000} seconds`
    };
  } finally {
    await prisma.$disconnect();
    console.log('Database connection closed');
  }
}

// Run the diagnostics and handle results
runDiagnostics()
  .then(result => {
    console.log(`\nDiagnostics completed in ${result.duration}`);
    console.log(`Overall status: ${result.success ? 'SUCCESS' : 'FAILURE'}`);
    
    if (!result.success && result.error) {
      console.error(`Error: ${result.error}`);
    }
    
    // Explicit exit with appropriate code
    if (result.success) {
      console.log('All tests passed. The sync-data script should run correctly.');
      process.exit(0);
    } else {
      console.error('One or more diagnostic tests failed. Fix the issues before running the full sync-data script.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Fatal error during diagnostics:', error);
    process.exit(1);
  });
