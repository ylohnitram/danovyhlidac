// A simple script to check database connectivity and structure

import { PrismaClient } from '@prisma/client';

console.log('=== Database Diagnostic Script ===');
console.log(`Running at: ${new Date().toISOString()}`);
console.log(`Environment: NODE_ENV=${process.env.NODE_ENV}`);

// Create a new PrismaClient instance with verbose logging
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Type for table result
type TableRecord = {
  tablename: string;
  schemaname: string;
};

// Type for count result
type CountResult = {
  count: number | string;
};

// Type for existence check
type ExistResult = {
  exists: boolean;
};

async function checkDatabase() {
  try {
    console.log('1. Testing basic connectivity...');
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✓ Database connection successful');

    console.log('\n2. Checking database tables...');
    const tables = await prisma.$queryRaw<TableRecord[]>`
      SELECT tablename, schemaname 
      FROM pg_tables 
      WHERE schemaname='public'
      ORDER BY tablename
    `;
    
    console.log('Tables found in database:');
    console.table(tables);

    console.log('\n3. Checking table structure...');
    // List of expected tables
    const expectedTables = ['smlouva', 'dodavatel', 'dodatek', 'podnet'];
    
    // Check if tables exist with case-insensitive matching
    for (const tableName of expectedTables) {
      // This query checks for tables with names matching case-insensitively
      const query = `
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname='public' 
        AND LOWER(tablename)=LOWER('${tableName}')
      `;
      
      const result = await prisma.$queryRawUnsafe<TableRecord[]>(query);
      
      if (Array.isArray(result) && result.length > 0) {
        const actualName = result[0].tablename;
        console.log(`✓ Table '${tableName}' found as '${actualName}'`);
        
        // Check if we can query the table
        try {
          const countQuery = `SELECT COUNT(*) as count FROM "${actualName}"`;
          const countResult = await prisma.$queryRawUnsafe<CountResult[]>(countQuery);
          // Handle count result - might be a string or number depending on database
          const count = typeof countResult[0]?.count === 'string' 
            ? parseInt(countResult[0].count as string, 10) 
            : (countResult[0]?.count || 0);
            
          console.log(`  - Contains ${count} records`);
          
          if (count > 0) {
            // Sample first record
            const sampleQuery = `SELECT * FROM "${actualName}" LIMIT 1`;
            const sample = await prisma.$queryRawUnsafe<Record<string, any>[]>(sampleQuery);
            if (sample && sample.length > 0) {
              console.log(`  - Sample record: ${JSON.stringify(sample[0], null, 2)}`);
            }
          }
        } catch (error) {
          console.error(`  ✗ Error querying table '${actualName}':`, error);
        }
      } else {
        console.log(`✗ Table '${tableName}' not found in database`);
      }
    }

    console.log('\n4. Database setup status:');
    // Check if the essential tables are available
    const tableCheck = await Promise.all(
      expectedTables.map(async (tableName) => {
        const query = `
          SELECT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE schemaname='public' 
            AND LOWER(tablename)=LOWER('${tableName}')
          ) as exists
        `;
        
        const result = await prisma.$queryRawUnsafe<ExistResult[]>(query);
        return {
          table: tableName,
          exists: !!result[0]?.exists
        };
      })
    );
    
    const missingTables = tableCheck.filter(t => !t.exists).map(t => t.table);
    
    if (missingTables.length === 0) {
      console.log('✓ All required tables exist');
      console.log('✓ Database is properly configured');
    } else {
      console.log(`✗ Missing tables: ${missingTables.join(', ')}`);
      console.log('✗ Database needs initialization');
    }

    return {
      success: true,
      message: 'Database check completed',
      tableStatus: tableCheck
    };
  } catch (error) {
    console.error('Error during database check:', error);
    return {
      success: false,
      message: 'Database check failed',
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // Always close the database connection
    await prisma.$disconnect();
    console.log('\nDatabase connection closed');
  }
}

// Run the check function
checkDatabase()
  .then(result => {
    console.log('\n=== Database Check Summary ===');
    console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`Message: ${result.message}`);
    
    if (!result.success) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error during database check:', error);
    process.exit(1);
  });
