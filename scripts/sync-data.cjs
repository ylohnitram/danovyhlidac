// CommonJS wrapper for sync-data.ts
// This uses npx to ensure ts-node is available

const { execSync } = require('child_process');

try {
  console.log('Running the data sync script with ts-node...');
  
  // Run the ts-node command directly using execSync
  const output = execSync('npx ts-node --project tsconfig.scripts.json scripts/sync-data.ts', {
    stdio: 'inherit' // This will show the output in real-time
  });
  
  process.exit(0);
} catch (error) {
  console.error('Failed to run the sync script:', error.message);
  process.exit(1);
}
