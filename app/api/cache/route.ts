import { type NextRequest, NextResponse } from "next/server"
import { clearAllCache } from "@/app/actions/smlouvy"

// API endpoint to clear all cache
export async function POST(request: NextRequest) {
  try {
    // Check for authorization (in a real app, you would use a more secure method)
    const authHeader = request.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.substring(7)

    // In a real app, you would validate the token against a secure source
    // For now, we'll use a simple environment variable check
    if (token !== process.env.CACHE_ADMIN_TOKEN) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 })
    }

    // Clear all cache
    const result = await clearAllCache()

    if (result.success) {
      return NextResponse.json({ message: "Cache cleared successfully" }, { status: 200 })
    } else {
      return NextResponse.json({ error: result.error || "Failed to clear cache" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error clearing cache:", error)

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// API endpoint to get cache status
export async function GET(request: NextRequest) {
  try {
    // Check for authorization (in a real app, you would use a more secure method)
    const authHeader = request.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.substring(7)

    // In a real app, you would validate the token against a secure source
    if (token !== process.env.CACHE_ADMIN_TOKEN) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 })
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

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

