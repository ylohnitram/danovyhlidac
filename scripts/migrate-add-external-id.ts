import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migration() {
  try {
    console.log('Starting migration: Adding external_id column...');
    
    // Check if the column already exists
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'smlouva' AND column_name = 'external_id'
    `;
    
    if (Array.isArray(tableInfo) && tableInfo.length > 0) {
      console.log('Column external_id already exists, skipping creation.');
    } else {
      // Add the column
      await prisma.$executeRaw`ALTER TABLE "smlouva" ADD COLUMN "external_id" TEXT`;
      console.log('Added external_id column to smlouva table.');
    }
    
    // Check if the index already exists
    const indexInfo = await prisma.$queryRaw`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'smlouva' AND indexname = 'idx_smlouva_external_id'
    `;
    
    if (Array.isArray(indexInfo) && indexInfo.length > 0) {
      console.log('Index idx_smlouva_external_id already exists, skipping creation.');
    } else {
      // Create the index
      await prisma.$executeRaw`CREATE INDEX idx_smlouva_external_id ON "smlouva" ("external_id")`;
      console.log('Created index idx_smlouva_external_id.');
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error running migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migration()
  .then(() => {
    console.log('Migration script completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
