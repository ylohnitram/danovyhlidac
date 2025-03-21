import { type NextRequest, NextResponse } from "next/server"
import { getCacheHealthMetrics, formatBytes } from "@/lib/cache-utils"

// API endpoint to get cache health metrics
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

    // Get cache health metrics
    let metrics;
    try {
      metrics = await getCacheHealthMetrics();
    } catch (metricsError) {
      console.warn("Error getting cache metrics:", metricsError);
      metrics = {
        totalKeys: 0,
        totalSize: 0,
        hitRatio: 0,
        oldestKey: null,
        newestKey: null
      };
    }

    // Add formatted size
    const formattedMetrics = {
      ...metrics,
      formattedSize: formatBytes(metrics.totalSize),
      status: metrics.hitRatio > 0.7 ? "healthy" : metrics.hitRatio > 0.4 ? "warning" : "critical",
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json(formattedMetrics, { status: 200 })
  } catch (error) {
    console.error("Error getting cache health metrics:", error)

    return NextResponse.json({ 
      error: "Internal server error", 
      details: String(error) 
    }, { status: 500 })
  }
}
