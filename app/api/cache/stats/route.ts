import { type NextRequest, NextResponse } from "next/server"
import { kv } from "@/lib/redis"
import { getCachedStats } from "@/lib/cache"

// API endpoint to get detailed cache statistics
export async function GET(request: NextRequest) {
  try {
    // In development, allow without token for easier testing
    const isDev = process.env.NODE_ENV === 'development';
    
    // Check for authorization only in production
    if (process.env.NODE_ENV !== 'development') {
      const authHeader = request.headers.get("Authorization")
      
      // Accept token with or without Bearer prefix
      const token = authHeader 
        ? (authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader)
        : null;
        
      // Allow access if the ENABLE_DB_DEBUG flag is set
      const debugEnabled = process.env.ENABLE_DB_DEBUG === 'true';
      
      if (!debugEnabled && (!token || token !== process.env.CACHE_ADMIN_TOKEN)) {
        console.log('Auth failed. Token mismatch or missing. Debug enabled:', debugEnabled);
        return NextResponse.json({ 
          error: "Unauthorized", 
          details: "Invalid or missing authentication" 
        }, { status: 401 });
      }
    }

    // Get performance stats
    const performanceStats = (await getCachedStats("performance")) || {
      hits: 0,
      misses: 0,
      ratio: 0,
      lastReset: new Date().toISOString(),
    }

    // Get all cache keys
    let smlouvyListKeys = [];
    let smlouvaDetailKeys = [];
    let statsKeys = [];
    
    try {
      smlouvyListKeys = await kv.keys("smlouvy:list:*") || [];
      smlouvaDetailKeys = await kv.keys("smlouva:detail:*") || [];
      statsKeys = await kv.keys("stats:*") || [];
    } catch (keysError) {
      console.warn("Error getting keys:", keysError);
      // Continue with empty arrays if there's an error
    }

    // Get memory usage (this is an approximation)
    let info = { memory: { used_memory: 0 } };
    try {
      info = await kv.info() || { memory: { used_memory: 0 } };
    } catch (infoError) {
      console.warn("Error getting Redis info:", infoError);
      // Continue with default info if there's an error
    }

    return NextResponse.json(
      {
        performance: performanceStats,
        counts: {
          smlouvyList: smlouvyListKeys.length,
          smlouvaDetail: smlouvaDetailKeys.length,
          stats: statsKeys.length,
          total: smlouvyListKeys.length + smlouvaDetailKeys.length + statsKeys.length,
        },
        memory: info,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Error getting cache statistics:", error)

    return NextResponse.json({ 
      error: "Internal server error", 
      details: String(error) 
    }, { status: 500 })
  }
}
