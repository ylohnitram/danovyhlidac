import { kv } from "@/lib/redis"

/**
 * Get the size of a Redis key in bytes
 */
export async function getKeySize(key: string): Promise<number> {
  try {
    // For string values
    const value = await kv.get(key)
    if (value) {
      return JSON.stringify(value).length
    }

    // For hash values
    const hashValue = await kv.hgetall(key)
    if (hashValue && Object.keys(hashValue).length > 0) {
      return JSON.stringify(hashValue).length
    }

    return 0
  } catch (error) {
    console.error(`Error getting size for key ${key}:`, error)
    return 0
  }
}

/**
 * Get the total size of all keys matching a pattern
 */
export async function getTotalSizeForPattern(pattern: string): Promise<{ count: number; size: number }> {
  try {
    const keys = await kv.keys(pattern)
    let totalSize = 0

    for (const key of keys) {
      const size = await getKeySize(key)
      totalSize += size
    }

    return {
      count: keys.length,
      size: totalSize,
    }
  } catch (error) {
    console.error(`Error getting total size for pattern ${pattern}:`, error)
    return { count: 0, size: 0 }
  }
}

/**
 * Format bytes to human-readable format
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
}

/**
 * Get cache health metrics
 */
export async function getCacheHealthMetrics(): Promise<{
  totalKeys: number
  totalSize: number
  hitRatio: number
  oldestKey: { key: string; ttl: number } | null
  newestKey: { key: string; ttl: number } | null
}> {
  try {
    // Get all keys
    const allKeys = await kv.keys("*")

    // Get total size
    let totalSize = 0
    for (const key of allKeys) {
      const size = await getKeySize(key)
      totalSize += size
    }

    // Get performance stats
    const performanceStats = (await kv.get("stats:performance")) as any
    const hitRatio = performanceStats?.ratio || 0

    // Get oldest and newest keys
    let oldestKey = null
    let newestKey = null

    if (allKeys.length > 0) {
      const keysWithTTL = await Promise.all(
        allKeys.map(async (key) => {
          const ttl = await kv.ttl(key)
          return { key, ttl }
        }),
      )

      // Sort by TTL (ascending)
      const sortedKeys = keysWithTTL.sort((a, b) => a.ttl - b.ttl)

      oldestKey = sortedKeys[0]
      newestKey = sortedKeys[sortedKeys.length - 1]
    }

    return {
      totalKeys: allKeys.length,
      totalSize,
      hitRatio,
      oldestKey,
      newestKey,
    }
  } catch (error) {
    console.error("Error getting cache health metrics:", error)
    return {
      totalKeys: 0,
      totalSize: 0,
      hitRatio: 0,
      oldestKey: null,
      newestKey: null,
    }
  }
}

/**
 * Record a cache hit or miss
 */
export async function recordCacheAccess(isHit: boolean): Promise<void> {
  try {
    // Get current stats
    const stats = ((await kv.get("stats:performance")) as any) || {
      hits: 0,
      misses: 0,
      ratio: 0,
      lastReset: new Date().toISOString(),
    }

    // Update stats
    if (isHit) {
      stats.hits++
    } else {
      stats.misses++
    }

    // Calculate new ratio
    const total = stats.hits + stats.misses
    stats.ratio = total > 0 ? stats.hits / total : 0

    // Save updated stats
    await kv.set("stats:performance", stats, { ex: 60 * 60 * 24 * 30 }) // 30 days
  } catch (error) {
    console.error("Error recording cache access:", error)
  }
}
