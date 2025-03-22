// Script to create the necessary database tables

import { PrismaClient } from '@prisma/client';

console.log('=== DATABASE SETUP SCRIPT ===');
console.log(`Running at: ${new Date().toISOString()}`);

// Create the Prisma client
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

// Type for database tables
type TableRecord = {
  tablename: string;
  schemaname?: string;
};

/**
 * Check if a table exists (case-insensitive)
 */
async function tableExists(tableName: string): Promise<string | null> {
  try {
    const query = `
      SELECT tablename FROM pg_tables 
      WHERE schemaname='public' 
      AND LOWER(tablename)=LOWER('${tableName}')
    `;
    
    const result = await prisma.$queryRawUnsafe<TableRecord[]>(query);
    
    if (Array.isArray(result) && result.length > 0) {
      return result[0].tablename; // Return the actual table name with correct case
    }
    
    return null; // Table doesn't exist
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return null;
  }
}

/**
 * Create tables if they don't exist
 */
async function createTables() {
  console.log('Checking and creating required tables...');
  
  try {
    // 1. Create smlouva table
    const smlouvaTableName = await tableExists('smlouva');
    
    if (!smlouvaTableName) {
      console.log('Creating smlouva table...');
      
      await prisma.$executeRaw`
        CREATE TABLE "smlouva" (
          "id" SERIAL PRIMARY KEY,
          "nazev" TEXT NOT NULL,
          "castka" FLOAT NOT NULL,
          "kategorie" TEXT NOT NULL,
          "datum" TIMESTAMP NOT NULL,
          "dodavatel" TEXT NOT NULL,
          "zadavatel" TEXT NOT NULL,
          "typ_rizeni" TEXT DEFAULT 'standardní',
          "lat" FLOAT NULL,
          "lng" FLOAT NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      console.log('✓ smlouva table created');
    } else {
      console.log(`✓ smlouva table already exists as "${smlouvaTableName}"`);
    }
    
    // 2. Create dodavatel table
    const dodavatelTableName = await tableExists('dodavatel');
    
    if (!dodavatelTableName) {
      console.log('Creating dodavatel table...');
      
      await prisma.$executeRaw`
        CREATE TABLE "dodavatel" (
          "nazev" TEXT PRIMARY KEY,
          "ico" TEXT,
          "datum_zalozeni" TIMESTAMP,
          "pocet_zamestnancu" INTEGER,
          "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      console.log('✓ dodavatel table created');
    } else {
      console.log(`✓ dodavatel table already exists as "${dodavatelTableName}"`);
    }
    
    // 3. Create dodatek table
    const dodatekTableName = await tableExists('dodatek');
    
    if (!dodatekTableName) {
      console.log('Creating dodatek table...');
      
      // Get the actual smlouva table name for the foreign key
      const actualSmlouvaTable = await tableExists('smlouva') || 'smlouva';
      
      try {
        // Try to create with foreign key constraint
        await prisma.$executeRawUnsafe(`
          CREATE TABLE "dodatek" (
            "id" SERIAL PRIMARY KEY,
            "smlouva_id" INTEGER NOT NULL,
            "castka" FLOAT NOT NULL,
            "datum" TIMESTAMP NOT NULL,
            "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "dodatek_smlouva_id_fkey" FOREIGN KEY ("smlouva_id") 
            REFERENCES "${actualSmlouvaTable}" ("id") ON DELETE CASCADE
          )
        `);
        
        console.log('✓ dodatek table created with foreign key constraint');
      } catch (error) {
        console.warn('Failed to create dodatek table with foreign key constraint:', error);
        console.log('Attempting to create without foreign key constraint...');
        
        // Try without foreign key constraint
        await prisma.$executeRaw`
          CREATE TABLE "dodatek" (
            "id" SERIAL PRIMARY KEY,
            "smlouva_id" INTEGER NOT NULL,
            "castka" FLOAT NOT NULL,
            "datum" TIMESTAMP NOT NULL,
            "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `;
        
        console.log('✓ dodatek table created without foreign key constraint');
      }
    } else {
      console.log(`✓ dodatek table already exists as "${dodatekTableName}"`);
    }
    
    // 4. Create podnet table
    const podnetTableName = await tableExists('podnet');
    
    if (!podnetTableName) {
      console.log('Creating podnet table...');
      
      // Get the actual smlouva table name for the foreign key
      const actualSmlouvaTable = await tableExists('smlouva') || 'smlouva';
      
      try {
        // Try to create with foreign key constraint
        await prisma.$executeRawUnsafe(`
          CREATE TABLE "podnet" (
            "id" SERIAL PRIMARY KEY,
            "jmeno" TEXT NOT NULL,
            "email" TEXT NOT NULL,
            "smlouva_id" INTEGER NOT NULL,
            "zprava" TEXT NOT NULL,
            "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "podnet_smlouva_id_fkey" FOREIGN KEY ("smlouva_id") 
            REFERENCES "${actualSmlouvaTable}" ("id") ON DELETE CASCADE
          )
        `);
        
        console.log('✓ podnet table created with foreign key constraint');
      } catch (error) {
        console.warn('Failed to create podnet table with foreign key constraint:', error);
        console.log('Attempting to create without foreign key constraint...');
        
        // Try without foreign key constraint
        await prisma.$executeRaw`
          CREATE TABLE "podnet" (
            "id" SERIAL PRIMARY KEY,
            "jmeno" TEXT NOT NULL,
            "email" TEXT NOT NULL,
            "smlouva_id" INTEGER NOT NULL,
            "zprava" TEXT NOT NULL,
            "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `;
        
        console.log('✓ podnet table created without foreign key constraint');
      }
    } else {
      console.log(`✓ podnet table already exists as "${podnetTableName}"`);
    }
    
    // 5. Insert test data into smlouva if it's empty
    const smlouvaCount = await prisma.$queryRaw<[{count: number}]>`
      SELECT COUNT(*) as count FROM "smlouva"
    `;
    
    const count = Number(smlouvaCount[0]?.count || 0);
    
    if (count === 0) {
      console.log('smlouva table is empty, inserting sample data...');
      
      // Insert a test record
      await prisma.$executeRaw`
        INSERT INTO "smlouva" (
          "nazev", "castka", "kategorie", "datum", "dodavatel", "zadavatel", "typ_rizeni", 
          "lat", "lng", "created_at", "updated_at"
        ) VALUES (
          'Testovací smlouva', 1000000, 'test', CURRENT_TIMESTAMP, 
          'Test Dodavatel s.r.o.', 'Ministerstvo financí', 'standardní',
          50.0755, 14.4378, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;
      
      console.log('✓ Sample data inserted into smlouva table');
    } else {
      console.log(`✓ smlouva table already contains ${count} records`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error creating tables:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

// Main function to set up the database
async function setupDatabase() {
  console.log('Starting database setup...');
  const startTime = Date.now();
  
  try {
    // Check database connection
    console.log('Testing database connection...');
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✓ Database connection successful');
    
    // Create tables
    const result = await createTables();
    
    if (result.success) {
      console.log('All tables created or verified successfully!');
      return { 
        success: true, 
        duration: `${(Date.now() - startTime) / 1000} seconds` 
      };
    } else {
      return { 
        success: false, 
        error: result.error,
        duration: `${(Date.now() - startTime) / 1000} seconds` 
      };
    }
  } catch (error) {
    console.error('Error setting up database:', error);
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

// Run the setup and handle results
setupDatabase()
  .then(result => {
    console.log(`\nSetup completed in ${result.duration}`);
    console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILURE'}`);
    
    if (!result.success && result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error during database setup:', error);
    process.exit(1);
  });
