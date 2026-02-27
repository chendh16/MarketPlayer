import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

let client: RedisClientType | null = null;

export async function initRedis(): Promise<void> {
  try {
    client = createClient({
      url: config.REDIS_URL,
    });

    client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis connected');
    });

    client.on('reconnecting', () => {
      logger.warn('Redis reconnecting...');
    });

    await client.connect();
    logger.info('Redis connected successfully');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedisClient(): RedisClientType {
  if (!client) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return client;
}

export const redisClient = new Proxy({} as RedisClientType, {
  get(_target, prop) {
    const client = getRedisClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis connection closed');
  }
}

