import { type NextRequest, NextResponse } from "next/server"
import { getCacheHealthMetrics, formatBytes } from "@/lib/cache-utils"

// API endpoint to get cache health metrics
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

    // Get cache health metrics
    const metrics = await getCacheHealthMetrics()

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

    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 })
  }
}

