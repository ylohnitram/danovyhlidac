import fetch from 'node-fetch';

/**
 * Script to warm up the cache with common searches and categories
 */
async function warmCache() {
  try {
    console.log('Starting cache warming process...');
    
    // Get the admin token from environment variables
    const token = process.env.CACHE_ADMIN_TOKEN;
    
    if (!token) {
      console.error('Missing CACHE_ADMIN_TOKEN environment variable');
      process.exit(1);
    }
    
    // Call the cache warming endpoint
    const response = await fetch('http://localhost:3000/api/cache/warm', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API responded with status: ${response.status}, message: ${errorData.error || 'Unknown error'}`);
    }
    
    const result = await response.json();
    
    console.log('Cache warming completed successfully!');
    console.log(`Warmed ${result.warmed} queries`);
    console.log(`Timestamp: ${result.timestamp}`);
    
    // Print results summary
    if (result.results && result.results.length > 0) {
      console.log('\nWarmed queries:');
      result.results.forEach((item: any, index: number) => {
        console.log(`${index + 1}. Query: "${item.query}", Category: ${item.category}, Success: ${item.success}, Count: ${item.count || 'N/A'}`);
      });
    }
    
  } catch (error) {
    console.error('Error warming cache:', error);
    process.exit(1);
  }
}

// Run the cache warming
warmCache();
