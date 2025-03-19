import { type NextRequest, NextResponse } from "next/server"
import { fetchSmlouvy, type FetchSmlouvyParams } from "@/app/actions/smlouvy"

// API endpoint to warm the cache with common queries
export async function POST(request: NextRequest) {
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

    // Common search terms to pre-cache
    const commonSearchTerms = ["rekonstrukce", "stavba", "oprava", "dodávka", "služby"]
    const commonCategories = ["verejne-zakazky", "dotace"]

    const results = []

    // Pre-cache common queries
    for (const term of commonSearchTerms) {
      for (const category of commonCategories) {
        const params: FetchSmlouvyParams = {
          query: term,
          kategorie: category,
          page: 1,
          limit: 10,
          skipCache: true, // Force refresh
        }

        try {
          // Fetch and cache
          const result = await fetchSmlouvy(params)

          results.push({
            query: term,
            category,
            success: result.success,
            count: result.data.length,
          })
        } catch (error) {
          results.push({
            query: term,
            category,
            success: false,
            error: String(error),
          })
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        warmed: results.length,
        results,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Error warming cache:", error)

    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 })
  }
}

