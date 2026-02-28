# 工具函数模块

## 架构概览

```
src/utils/
├── logger.ts        # 日志工具
├── encryption.ts    # AES-256 加密
├── idempotency.ts   # 幂等性控制
└── market-hours.ts  # 市场时间判断
```

## 日志 (logger.ts)

基于 Winston，支持多级别日志：

```typescript
import { logger } from './logger';

logger.info('信息日志');
logger.warn('警告日志');
logger.error('错误日志', error);
logger.debug('调试日志');
```

**日志文件**：
- `logs/combined.log` - 所有日志
- `logs/error.log` - 仅错误日志

**配置**：
```bash
LOG_LEVEL=info   # debug | info | warn | error
```

## 加密 (encryption.ts)

AES-256-CBC 加密，用于保护 API 密钥：

```typescript
import { encrypt, decrypt } from './encryption';

const encrypted = encrypt('my-api-key');
const original = decrypt(encrypted);
```

**配置**：
```bash
ENCRYPTION_KEY=your_32_byte_hex_key   # 32字节十六进制
ENCRYPTION_IV=your_16_byte_hex_iv     # 16字节十六进制
```

**生成密钥**：
```bash
node scripts/generate-keys.js
```

## 幂等性 (idempotency.ts)

防止重复操作，基于 Redis 分布式锁：

```typescript
import { acquireLock, releaseLock } from './idempotency';

const lock = await acquireLock(`order:${orderToken}`, 30);
if (!lock) {
  // 已有其他进程在处理
  return;
}

try {
  await processOrder();
} finally {
  await releaseLock(`order:${orderToken}`);
}
```

**使用场景**：
- 防止订单重复执行
- 防止信号重复推送
- 防止并发风控冲突

## 市场时间 (market-hours.ts)

判断当前是否在交易时间内：

```typescript
import { isMarketOpen } from './market-hours';

isMarketOpen('us');   // 美股是否开盘
isMarketOpen('hk');   // 港股是否开盘
isMarketOpen('a');    // A股是否开盘
isMarketOpen('btc');  // 始终返回 true
```

**市场时间（北京时间）**：
- 美股：21:30 - 04:00（夏令时 20:30 - 03:00）
- 港股：09:30 - 16:00
- A股：09:30 - 15:00
- BTC：24小时

