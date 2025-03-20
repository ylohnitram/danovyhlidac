import { createClient } from '@vercel/kv'
import Redis from 'ioredis'

// Function to initialize Redis client
const createRedisClient = () => {
  // If we have the Vercel KV environment variables, use them directly
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  }
  
  // If we have a standard Redis URL (redis://), use ioredis
  if (process.env.REDIS_URL && process.env.REDIS_URL.startsWith('redis://')) {
    console.log('Using ioredis client with standard Redis URL');
    const redis = new Redis(process.env.REDIS_URL);
    
    // Create adapter with same interface as @vercel/kv for compatibility
    return {
      get: async (key: string) => {
        const value = await redis.get(key);
        if (value === null) return null;
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      },
      set: async (key: string, value: any, options?: any) => {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        if (options?.ex) {
          return redis.set(key, serialized, 'EX', options.ex);
        }
        return redis.set(key, serialized);
      },
      del: async (...keys: string[]) => {
        if (keys.length === 0) return 0;
        return redis.del(keys);
      },
      keys: async (pattern: string) => {
        return redis.keys(pattern);
      },
      hset: async (key: string, field: any) => {
        const entries = Object.entries(field);
        if (entries.length === 0) return 0;
        
        const args: any[] = [key];
        for (const [fieldName, fieldValue] of entries) {
          const serializedValue = typeof fieldValue === 'string' 
            ? fieldValue 
            : JSON.stringify(fieldValue);
          args.push(fieldName, serializedValue);
        }
        
        return redis.hset(...args);
      },
      hget: async (key: string, field: string) => {
        const value = await redis.hget(key, field);
        if (value === null) return null;
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      },
      hgetall: async (key: string) => {
        const result = await redis.hgetall(key);
        if (!result) return {};
        
        // Try to parse JSON values
        const parsed: Record<string, any> = {};
        for (const [field, value] of Object.entries(result)) {
          try {
            parsed[field] = JSON.parse(value);
          } catch (e) {
            parsed[field] = value;
          }
        }
        
        return parsed;
      },
      exists: async (key: string) => {
        return redis.exists(key);
      },
      ttl: async (key: string) => {
        return redis.ttl(key);
      },
      expire: async (key: string, seconds: number) => {
        return redis.expire(key, seconds);
      },
      info: async () => {
        const info = await redis.info();
        const memory = info.match(/used_memory:(\d+)/);
        return { 
          memory: { 
            used_memory: memory ? parseInt(memory[1]) : 0 
          } 
        };
      },
    }
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
