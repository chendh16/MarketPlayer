#!/usr/bin/env node

/**
 * 生成加密密钥的脚本
 * 运行: node scripts/generate-keys.js
 */

const crypto = require('crypto');

console.log('=== MarketPlayer 加密密钥生成 ===\n');

const encryptionKey = crypto.randomBytes(32).toString('hex');
const encryptionIV = crypto.randomBytes(16).toString('hex');
const jwtSecret = crypto.randomBytes(48).toString('base64');

console.log('请将以下内容添加到 .env 文件中：\n');
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log(`ENCRYPTION_IV=${encryptionIV}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log('\n⚠️  请妥善保管这些密钥，不要泄露或提交到代码仓库！');

