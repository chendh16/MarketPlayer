import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-cbc';

export function encrypt(text: string): string {
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(config.ENCRYPTION_IV, 'hex');
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return encrypted;
}

export function decrypt(encryptedText: string): string {
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(config.ENCRYPTION_IV, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// 生成随机密钥的辅助函数（用于初始化）
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateEncryptionIV(): string {
  return crypto.randomBytes(16).toString('hex');
}

