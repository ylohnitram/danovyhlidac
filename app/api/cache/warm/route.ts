import { type NextRequest, NextResponse } from "next/server"
import { fetchSmlouvy, type FetchSmlouvyParams } from "@/app/actions/smlouvy"
import { clearAllCache } from "@/app/actions/smlouvy"

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

    // Optionally clear the cache first to ensure fresh data
    const shouldClearFirst = request.nextUrl.searchParams.get("clearFirst") === "true"
    if (shouldClearFirst) {
      await clearAllCache()
      console.log("Cache cleared before warming")
    }

    // Common search terms to pre-cache
    const commonSearchTerms = ["rekonstrukce", "stavba", "oprava", "dodávka", "služby", "silnice", "škola", "nemocnice"]
    const commonCategories = ["verejne-zakazky", "dotace", "prodej-majetku", "najem", "ostatni"]
    const commonCities = ["praha", "brno", "ostrava", "plzen", "liberec"]
    
    // Price ranges to pre-cache
    const priceRanges = [
      { min: 1000000, max: 10000000 },
      { min: 10000000, max: 50000000 },
      { min: 50000000, max: null }
    ]

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

    // Pre-cache city-based queries
    for (const city of commonCities) {
      for (const range of priceRanges) {
        const params: FetchSmlouvyParams = {
          zadavatel: city,
          minCastka: range.min,
          maxCastka: range.max,
          page: 1,
          limit: 20,
          skipCache: true,
        }

        try {
          const result = await fetchSmlouvy(params)
          
          results.push({
            city,
            priceRange: `${range.min} - ${range.max || 'max'}`,
            success: result.success,
            count: result.data.length,
          })
        } catch (error) {
          results.push({
            city,
            priceRange: `${range.min} - ${range.max || 'max'}`,
            success: false,
            error: String(error),
          })
        }
      }
    }

    // Pre-cache first page of all contracts (latest)
    try {
      const allContractsResult = await fetchSmlouvy({
        page: 1,
        limit: 50,
        skipCache: true,
      })

      results.push({
        query: "all-contracts",
        success: allContractsResult.success,
        count: allContractsResult.data.length,
      })
    } catch (error) {
      results.push({
        query: "all-contracts",
        success: false,
        error: String(error),
      })
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
