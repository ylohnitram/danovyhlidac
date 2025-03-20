import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

/**
 * This script checks if the database is properly set up,
 * and if not, attempts to run the migrations.
 */
async function setupDatabase() {
  console.log('Checking database setup...');
  
  try {
    // Try a simple query to check if the schema exists
    await prisma.smlouva.count();
    console.log('Database schema is already set up correctly.');
    return { success: true, message: 'Database schema already exists' };
  } catch (error: any) {
    // If the error indicates the schema doesn't exist, run migrations
    if (error.message?.includes('does not exist') || 
        error.code === 'P2010' ||
        error.meta?.details?.includes('does not exist')) {
      
      console.log('Database schema not found. Attempting to run migrations...');
      
      try {
        // Run migrations using Prisma CLI
        console.log('Generating Prisma client...');
        execSync('npx prisma generate', { stdio: 'inherit' });
        
        console.log('Running database migrations...');
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        
        console.log('Running database seed if available...');
        try {
          execSync('npx prisma db seed', { stdio: 'inherit' });
        } catch (seedError) {
          console.log('No seed script found or error running seed:', seedError);
        }
        
        // Verify that migrations were successful
        try {
          await prisma.smlouva.count();
          console.log('Database setup completed successfully!');
          return { success: true, message: 'Database migrations applied successfully' };
        } catch (verifyError) {
          console.error('Migrations ran but schema verification failed:', verifyError);
          return { 
            success: false, 
            message: 'Migrations applied but schema verification failed',
            error: verifyError instanceof Error ? verifyError.message : String(verifyError)
          };
        }
      } catch (migrationError) {
        console.error('Error running migrations:', migrationError);
        return { 
          success: false, 
          message: 'Failed to apply database migrations',
          error: migrationError instanceof Error ? migrationError.message : String(migrationError)
        };
      }
    } else {
      // If it's a different error, just return it
      console.error('Unexpected database error:', error);
      return { 
        success: false, 
        message: 'Unexpected database error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run this function if this script is executed directly
if (require.main === module) {
  setupDatabase()
    .then((result) => {
      if (result.success) {
        console.log('Setup completed successfully:', result.message);
        process.exit(0);
      } else {
        console.error('Setup failed:', result.message, result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Unhandled error during setup:', error);
      process.exit(1);
    });
}

export { setupDatabase };
