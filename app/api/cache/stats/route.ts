import { type NextRequest, NextResponse } from "next/server"
import { kv } from "@/lib/redis"
import { getCachedStats } from "@/lib/cache"

// API endpoint to get detailed cache statistics
export async function GET(request: NextRequest) {
  try {
    // Check for authorization
    const authHeader = request.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.substring(7)

    if (token !== process.env.CACHE_ADMIN_TOKEN) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 })
    }

    // Get performance stats
    const performanceStats = (await getCachedStats("performance")) || {
      hits: 0,
      misses: 0,
      ratio: 0,
      lastReset: new Date().toISOString(),
    }

    // Get all cache keys
    const smlouvyListKeys = await kv.keys("smlouvy:list:*")
    const smlouvaDetailKeys = await kv.keys("smlouva:detail:*")
    const statsKeys = await kv.keys("stats:*")

    // Get memory usage (this is an approximation)
    const info = await kv.info()

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

    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 })
  }
}
