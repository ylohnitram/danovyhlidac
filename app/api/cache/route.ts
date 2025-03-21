import { type NextRequest, NextResponse } from "next/server"
import { clearAllCache } from "@/app/actions/smlouvy"

// API endpoint to clear all cache
export async function POST(request: NextRequest) {
  try {
    // In development, allow without token for easier testing
    const isDev = process.env.NODE_ENV === 'development';
    
    // Check for authorization only in production
    if (process.env.NODE_ENV !== 'development') {
      const authHeader = request.headers.get("Authorization")
      
      // Removed Bearer token requirement for simpler testing
      // Now accepts both "Bearer TOKEN" and just "TOKEN"
      const token = authHeader 
        ? (authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader)
        : null;
      
      // Allow access if the ENABLE_DB_DEBUG flag is set, regardless of token
      const debugEnabled = process.env.ENABLE_DB_DEBUG === 'true';
      
      if (!debugEnabled && (!token || token !== process.env.CACHE_ADMIN_TOKEN)) {
        console.log('Auth failed. Token mismatch or missing. Debug enabled:', debugEnabled);
        return NextResponse.json({ 
          error: "Unauthorized", 
          details: "Invalid or missing authentication" 
        }, { status: 401 });
      }
    }

    // Clear all cache
    const result = await clearAllCache()

    if (result.success) {
      return NextResponse.json({ 
        message: "Cache cleared successfully",
        timestamp: new Date().toISOString()
      }, { status: 200 })
    } else {
      return NextResponse.json({ 
        error: result.error || "Failed to clear cache",
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
  } catch (error) {
    console.error("Error clearing cache:", error)

    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

// API endpoint to get cache status
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

    // In a real app, you would get cache statistics here
    // For now, we'll return a simple status
    return NextResponse.json(
      {
        status: "active",
        message: "Cache is active and working properly",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Error getting cache status:", error)

    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
