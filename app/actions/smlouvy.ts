"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import {
  getCachedSmlouvyList,
  setCachedSmlouvyList,
  getCachedSmlouvaDetail,
  setCachedSmlouvaDetail,
  invalidateSmlouvyListCache,
  invalidateSmlouvaDetailCache,
  invalidateAllCache,
} from "@/lib/cache"

// Define the schema for the input parameters
const fetchSmlouvyParamsSchema = z.object({
  query: z.string().optional(),
  dodavatel: z.string().optional(),
  zadavatel: z.string().optional(),
  kategorie: z.string().optional(),
  minCastka: z.number().optional(),
  maxCastka: z.number().optional(),
  datumOd: z.string().optional(), // ISO date string
  datumDo: z.string().optional(), // ISO date string
  page: z.number().default(1),
  limit: z.number().default(10),
  skipCache: z.boolean().optional(),
})

// Define the type for the input parameters
export type FetchSmlouvyParams = z.infer<typeof fetchSmlouvyParamsSchema>

// Define the type for a single contract
export type Smlouva = {
  id: string
  nazev: string
  castka: number
  mena: string
  datumUzavreni: string
  dodavatel: {
    nazev: string
    ico: string
  }
  zadavatel: {
    nazev: string
    ico: string
  }
  predmet: string
  odkaz: string
  lat?: number
  lng?: number
}

// Define the type for the response
export type FetchSmlouvyResponse = {
  data: Smlouva[]
  total: number
  page: number
  limit: number
  totalPages: number
  success: boolean
  error?: string
  cached?: boolean
  cacheAge?: number
}

/**
 * Server action to fetch contracts from the Czech Contract Registry
 */
export async function fetchSmlouvy(params: FetchSmlouvyParams): Promise<FetchSmlouvyResponse> {
  try {
    // Validate input parameters
    const validatedParams = fetchSmlouvyParamsSchema.parse(params)

    // Check if we should skip cache
    const skipCache = validatedParams.skipCache || false

    // Try to get from cache first (if not skipping cache)
    if (!skipCache) {
      const cachedData = await getCachedSmlouvyList(validatedParams)
      if (cachedData) {
        // Return cached data with a flag indicating it's from cache
        return {
          ...cachedData,
          cached: true,
        }
      }
    }

    // Calculate pagination parameters
    const page = validatedParams.page || 1
    const limit = validatedParams.limit || 10
    const offset = (page - 1) * limit

    // Build the API URL for the Czech Contract Registry
    // Note: This is a simplified example. The actual API might have different parameters.
    const apiUrl = new URL("https://smlouvy.gov.cz/api/v2/smlouvy")

    // Add query parameters
    if (validatedParams.query) {
      apiUrl.searchParams.append("q", validatedParams.query)
    }

    if (validatedParams.dodavatel) {
      apiUrl.searchParams.append("dodavatel", validatedParams.dodavatel)
    }

    if (validatedParams.zadavatel) {
      apiUrl.searchParams.append("zadavatel", validatedParams.zadavatel)
    }

    if (validatedParams.kategorie) {
      apiUrl.searchParams.append("typ", validatedParams.kategorie)
    }

    if (validatedParams.minCastka) {
      apiUrl.searchParams.append("hodnotaOd", validatedParams.minCastka.toString())
    }

    if (validatedParams.maxCastka) {
      apiUrl.searchParams.append("hodnotaDo", validatedParams.maxCastka.toString())
    }

    if (validatedParams.datumOd) {
      apiUrl.searchParams.append("datumUzavreniOd", validatedParams.datumOd)
    }

    if (validatedParams.datumDo) {
      apiUrl.searchParams.append("datumUzavreniDo", validatedParams.datumDo)
    }

    // Add pagination parameters
    apiUrl.searchParams.append("offset", offset.toString())
    apiUrl.searchParams.append("limit", limit.toString())

    // Set timeout for the fetch request
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    // Fetch data from the API
    const response = await fetch(apiUrl.toString(), {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
      next: {
        // Cache for 1 hour
        revalidate: 3600,
      },
    })

    // Clear the timeout
    clearTimeout(timeoutId)

    // Check if the response is OK
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`)
    }

    // Parse the response
    const rawData = await response.json()

    // Transform the data to our format
    // Note: This transformation depends on the actual API response structure
    const transformedData: Smlouva[] = rawData.items.map((item: any) => ({
      id: item.id,
      nazev: item.predmet || "Neuvedeno",
      castka: item.hodnotaBezDph || 0,
      mena: item.mena || "CZK",
      datumUzavreni: item.datumUzavreni,
      dodavatel: {
        nazev: item.dodavatel?.nazev || "Neuvedeno",
        ico: item.dodavatel?.ico || "Neuvedeno",
      },
      zadavatel: {
        nazev: item.zadavatel?.nazev || "Neuvedeno",
        ico: item.zadavatel?.ico || "Neuvedeno",
      },
      predmet: item.predmet || "Neuvedeno",
      odkaz: `https://smlouvy.gov.cz/smlouva/${item.id}`,
      // Note: Coordinates might not be available in the API
      // In a real app, you might need to geocode addresses
      lat: item.lat,
      lng: item.lng,
    }))

    // Calculate total pages
    const total = rawData.total || 0
    const totalPages = Math.ceil(total / limit)

    // Prepare the response
    const result: FetchSmlouvyResponse = {
      data: transformedData,
      total,
      page,
      limit,
      totalPages,
      success: true,
      cached: false,
    }

    // Cache the result for future requests
    await setCachedSmlouvyList(validatedParams, result)

    // Return the transformed data with pagination info
    return result
  } catch (error) {
    // Handle different types of errors
    if (error instanceof z.ZodError) {
      // Validation error
      return {
        data: [],
        total: 0,
        page: params.page || 1,
        limit: params.limit || 10,
        totalPages: 0,
        success: false,
        error: "Neplatné parametry požadavku: " + error.errors.map((e) => e.message).join(", "),
      }
    } else if (error instanceof Error) {
      if (error.name === "AbortError") {
        // Timeout error
        return {
          data: [],
          total: 0,
          page: params.page || 1,
          limit: params.limit || 10,
          totalPages: 0,
          success: false,
          error: "Požadavek vypršel. Zkuste to prosím znovu.",
        }
      } else {
        // Other errors
        console.error("Error fetching contracts:", error)
        return {
          data: [],
          total: 0,
          page: params.page || 1,
          limit: params.limit || 10,
          totalPages: 0,
          success: false,
          error: "Došlo k chybě při načítání dat: " + error.message,
        }
      }
    } else {
      // Unknown error
      console.error("Unknown error fetching contracts:", error)
      return {
        data: [],
        total: 0,
        page: params.page || 1,
        limit: params.limit || 10,
        totalPages: 0,
        success: false,
        error: "Došlo k neznámé chybě při načítání dat.",
      }
    }
  }
}

/**
 * Server action to fetch a single contract by ID
 */
export async function fetchSmlouvaById(
  id: string,
  skipCache = false,
): Promise<{ data: Smlouva | null; success: boolean; error?: string; cached?: boolean }> {
  try {
    // Validate the ID
    if (!id || typeof id !== "string") {
      throw new Error("Neplatné ID smlouvy")
    }

    // Try to get from cache first (if not skipping cache)
    if (!skipCache) {
      const cachedData = await getCachedSmlouvaDetail(id)
      if (cachedData) {
        // Return cached data with a flag indicating it's from cache
        return {
          ...cachedData,
          cached: true,
        }
      }
    }

    // Build the API URL for the Czech Contract Registry
    const apiUrl = `https://smlouvy.gov.cz/api/v2/smlouvy/${id}`

    // Set timeout for the fetch request
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    // Fetch data from the API
    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
      next: {
        // Cache for 1 day
        revalidate: 86400,
      },
    })

    // Clear the timeout
    clearTimeout(timeoutId)

    // Check if the response is OK
    if (!response.ok) {
      if (response.status === 404) {
        return {
          data: null,
          success: false,
          error: "Smlouva nebyla nalezena",
        }
      }
      throw new Error(`API responded with status: ${response.status}`)
    }

    // Parse the response
    const rawData = await response.json()

    // Transform the data to our format
    const transformedData: Smlouva = {
      id: rawData.id,
      nazev: rawData.predmet || "Neuvedeno",
      castka: rawData.hodnotaBezDph || 0,
      mena: rawData.mena || "CZK",
      datumUzavreni: rawData.datumUzavreni,
      dodavatel: {
        nazev: rawData.dodavatel?.nazev || "Neuvedeno",
        ico: rawData.dodavatel?.ico || "Neuvedeno",
      },
      zadavatel: {
        nazev: rawData.zadavatel?.nazev || "Neuvedeno",
        ico: rawData.zadavatel?.ico || "Neuvedeno",
      },
      predmet: rawData.predmet || "Neuvedeno",
      odkaz: `https://smlouvy.gov.cz/smlouva/${rawData.id}`,
      // Note: Coordinates might not be available in the API
      lat: rawData.lat,
      lng: rawData.lng,
    }

    // Prepare the result
    const result = {
      data: transformedData,
      success: true,
      cached: false,
    }

    // Cache the result for future requests
    await setCachedSmlouvaDetail(id, result)

    return result
  } catch (error) {
    // Handle different types of errors
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        // Timeout error
        return {
          data: null,
          success: false,
          error: "Požadavek vypršel. Zkuste to prosím znovu.",
        }
      } else {
        // Other errors
        console.error(`Error fetching contract with ID ${id}:`, error)
        return {
          data: null,
          success: false,
          error: "Došlo k chybě při načítání dat: " + error.message,
        }
      }
    } else {
      // Unknown error
      console.error(`Unknown error fetching contract with ID ${id}:`, error)
      return {
        data: null,
        success: false,
        error: "Došlo k neznámé chybě při načítání dat.",
      }
    }
  }
}

/**
 * Server action to refresh the contracts data
 */
export async function refreshSmlouvy(path: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Invalidate the cache
    await invalidateSmlouvyListCache()

    // Revalidate the path to refresh the data
    revalidatePath(path)

    return {
      success: true,
    }
  } catch (error) {
    console.error("Error refreshing contracts data:", error)

    return {
      success: false,
      error: "Došlo k chybě při obnovování dat.",
    }
  }
}

/**
 * Server action to refresh a specific contract
 */
export async function refreshSmlouva(id: string, path: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Invalidate the cache for this contract
    await invalidateSmlouvaDetailCache(id)

    // Revalidate the path to refresh the data
    revalidatePath(path)

    return {
      success: true,
    }
  } catch (error) {
    console.error(`Error refreshing contract with ID ${id}:`, error)

    return {
      success: false,
      error: "Došlo k chybě při obnovování dat.",
    }
  }
}

/**
 * Server action to clear all cache
 */
export async function clearAllCache(): Promise<{ success: boolean; error?: string }> {
  try {
    // Invalidate all cache
    await invalidateAllCache()

    return {
      success: true,
    }
  } catch (error) {
    console.error("Error clearing all cache:", error)

    return {
      success: false,
      error: "Došlo k chybě při mazání cache.",
    }
  }
}

