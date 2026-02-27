import { redisClient } from '../db/redis';

export async function checkOrderToken(orderToken: string): Promise<boolean> {
  const key = `order:token:${orderToken}`;
  const value = await redisClient.get(key);
  return value !== null;
}

export async function markOrderTokenProcessing(orderToken: string): Promise<boolean> {
  const key = `order:token:${orderToken}`;
  // NX: 只在键不存在时设置
  const result = await redisClient.set(key, 'processing', {
    NX: true,
    EX: 180, // 3分钟过期，防止死锁
  });
  return result === 'OK';
}

export async function markOrderTokenProcessed(orderToken: string): Promise<void> {
  const key = `order:token:${orderToken}`;
  await redisClient.setEx(key, 86400, 'processed'); // 24小时
}

export async function acquireDistributedLock(
  lockKey: string,
  ttlSeconds: number = 10
): Promise<boolean> {
  const result = await redisClient.set(lockKey, '1', {
    NX: true,
    EX: ttlSeconds,
  });
  return result === 'OK';
}

export async function releaseDistributedLock(lockKey: string): Promise<void> {
  await redisClient.del(lockKey);
}

