import { kv } from "@vercel/kv"
import type { FetchSmlouvyParams, FetchSmlouvyResponse, Smlouva } from "@/app/actions/smlouvy"

// Cache TTL (Time-To-Live) in seconds
const CACHE_TTL = {
  SMLOUVY_LIST: 60 * 60, // 1 hour
  SMLOUVA_DETAIL: 24 * 60 * 60, // 24 hours
  SEARCH_RESULTS: 15 * 60, // 15 minutes
  STATS: 12 * 60 * 60, // 12 hours
}

/**
 * Generate a cache key for a list of contracts based on query parameters
 */
export function generateSmlouvyListCacheKey(params: FetchSmlouvyParams): string {
  // Sort the params to ensure consistent cache keys
  const sortedParams = Object.entries(params)
    .filter(([_, value]) => value !== undefined)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}:${value}`)
    .join("|")

  return `smlouvy:list:${sortedParams}`
}

/**
 * Generate a cache key for a single contract
 */
export function generateSmlouvaDetailCacheKey(id: string): string {
  return `smlouva:detail:${id}`
}

/**
 * Get cached contracts list
 */
export async function getCachedSmlouvyList(params: FetchSmlouvyParams): Promise<FetchSmlouvyResponse | null> {
  try {
    const cacheKey = generateSmlouvyListCacheKey(params)
    const cachedData = await kv.get<FetchSmlouvyResponse>(cacheKey)
    return cachedData
  } catch (error) {
    console.error("Error getting cached contracts list:", error)
    return null
  }
}

/**
 * Set cached contracts list
 */
export async function setCachedSmlouvyList(params: FetchSmlouvyParams, data: FetchSmlouvyResponse): Promise<void> {
  try {
    const cacheKey = generateSmlouvyListCacheKey(params)

    // Determine TTL based on whether it's a search or not
    const ttl = params.query ? CACHE_TTL.SEARCH_RESULTS : CACHE_TTL.SMLOUVY_LIST

    await kv.set(cacheKey, data, { ex: ttl })
  } catch (error) {
    console.error("Error setting cached contracts list:", error)
  }
}

/**
 * Get cached contract detail
 */
export async function getCachedSmlouvaDetail(
  id: string,
): Promise<{ data: Smlouva | null; success: boolean; error?: string } | null> {
  try {
    const cacheKey = generateSmlouvaDetailCacheKey(id)
    const cachedData = await kv.get<{ data: Smlouva | null; success: boolean; error?: string }>(cacheKey)
    return cachedData
  } catch (error) {
    console.error(`Error getting cached contract detail for ID ${id}:`, error)
    return null
  }
}

/**
 * Set cached contract detail
 */
export async function setCachedSmlouvaDetail(
  id: string,
  data: { data: Smlouva | null; success: boolean; error?: string },
): Promise<void> {
  try {
    const cacheKey = generateSmlouvaDetailCacheKey(id)
    await kv.set(cacheKey, data, { ex: CACHE_TTL.SMLOUVA_DETAIL })
  } catch (error) {
    console.error(`Error setting cached contract detail for ID ${id}:`, error)
  }
}

/**
 * Invalidate cached contracts list
 */
export async function invalidateSmlouvyListCache(): Promise<void> {
  try {
    // Get all keys that match the pattern
    const keys = await kv.keys("smlouvy:list:*")

    if (keys.length > 0) {
      // Delete all matching keys
      await kv.del(...keys)
    }
  } catch (error) {
    console.error("Error invalidating contracts list cache:", error)
  }
}

/**
 * Invalidate cached contract detail
 */
export async function invalidateSmlouvaDetailCache(id: string): Promise<void> {
  try {
    const cacheKey = generateSmlouvaDetailCacheKey(id)
    await kv.del(cacheKey)
  } catch (error) {
    console.error(`Error invalidating contract detail cache for ID ${id}:`, error)
  }
}

/**
 * Invalidate all cache
 */
export async function invalidateAllCache(): Promise<void> {
  try {
    // Get all keys that match the patterns
    const smlouvyListKeys = await kv.keys("smlouvy:list:*")
    const smlouvaDetailKeys = await kv.keys("smlouva:detail:*")
    const statsKeys = await kv.keys("stats:*")

    const allKeys = [...smlouvyListKeys, ...smlouvaDetailKeys, ...statsKeys]

    if (allKeys.length > 0) {
      // Delete all matching keys
      await kv.del(...allKeys)
    }
  } catch (error) {
    console.error("Error invalidating all cache:", error)
  }
}

/**
 * Cache statistics data
 */
export async function cacheStats(key: string, data: any): Promise<void> {
  try {
    const cacheKey = `stats:${key}`
    await kv.set(cacheKey, data, { ex: CACHE_TTL.STATS })
  } catch (error) {
    console.error(`Error caching stats for key ${key}:`, error)
  }
}

/**
 * Get cached statistics data
 */
export async function getCachedStats<T>(key: string): Promise<T | null> {
  try {
    const cacheKey = `stats:${key}`
    const cachedData = await kv.get<T>(cacheKey)
    return cachedData
  } catch (error) {
    console.error(`Error getting cached stats for key ${key}:`, error)
    return null
  }
}

/**
 * Set cache with hash field (for more complex data structures)
 */
export async function setHashCache(
  key: string,
  field: string,
  value: any,
  ttl = CACHE_TTL.SMLOUVY_LIST,
): Promise<void> {
  try {
    await kv.hset(key, { [field]: JSON.stringify(value) })
    await kv.expire(key, ttl)
  } catch (error) {
    console.error(`Error setting hash cache for key ${key}, field ${field}:`, error)
  }
}

/**
 * Get cache with hash field
 */
export async function getHashCache<T>(key: string, field: string): Promise<T | null> {
  try {
    const value = await kv.hget<string>(key, field)
    return value ? (JSON.parse(value) as T) : null
  } catch (error) {
    console.error(`Error getting hash cache for key ${key}, field ${field}:`, error)
    return null
  }
}

/**
 * Check if cache exists
 */
export async function cacheExists(key: string): Promise<boolean> {
  try {
    return (await kv.exists(key)) > 0
  } catch (error) {
    console.error(`Error checking if cache exists for key ${key}:`, error)
    return false
  }
}

/**
 * Get cache TTL
 */
export async function getCacheTTL(key: string): Promise<number> {
  try {
    return await kv.ttl(key)
  } catch (error) {
    console.error(`Error getting cache TTL for key ${key}:`, error)
    return -1
  }
}

