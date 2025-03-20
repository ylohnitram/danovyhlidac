import { createClient } from '@vercel/kv'

// Function to initialize Redis client
const createRedisClient = () => {
  // If we have the Vercel KV environment variables, use them directly
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  }
  
  // If we only have REDIS_URL, use it
  if (process.env.REDIS_URL) {
    // The createClient function can accept a URL directly
    return createClient({
      url: process.env.REDIS_URL,
      // If using Redis with authentication, credentials should be in the URL
      // format: redis://username:password@host:port
    })
  }
  
  // Fallback for development/testing (not recommended for production)
  console.warn('No Redis configuration found. Using in-memory mock for development.')
  return createMemoryMockClient()
}

// A simple in-memory mock client for development/testing
function createMemoryMockClient() {
  const store = new Map<string, any>()
  
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: any, options?: any) => {
      store.set(key, value)
      return "OK"
    },
    del: async (...keys: string[]) => {
      let count = 0
      for (const key of keys) {
        if (store.delete(key)) count++
      }
      return count
    },
    keys: async (pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      return Array.from(store.keys()).filter(key => regex.test(key))
    },
    hset: async (key: string, field: any) => {
      const existing = store.get(key) || {}
      store.set(key, { ...existing, ...field })
      return Object.keys(field).length
    },
    hget: async (key: string, field: string) => {
      const hash = store.get(key) || {}
      return hash[field]
    },
    hgetall: async (key: string) => store.get(key) || {},
    exists: async (key: string) => store.has(key) ? 1 : 0,
    ttl: async (key: string) => store.has(key) ? -1 : -2, // -1 means no expiration
    expire: async (key: string, seconds: number) => store.has(key) ? 1 : 0,
    info: async () => ({ memory: { used_memory: 0 } }),
  }
}

// Create a global Redis instance
export const kv = createRedisClient()

export default kv
