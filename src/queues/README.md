# 队列处理模块

## 架构概览

```
src/queues/
├── news-queue.ts   # 新闻处理队列（核心）
└── order-queue.ts  # 订单执行队列
```

## 新闻处理队列 (news-queue.ts)

### 处理流程

```
newsQueue.add('process-news', { newsItemId })
    ↓
ensureInitialized()     ← 自动初始化 PostgreSQL + Redis + Discord
    ↓
processAnalysis()       ← 步骤1：AI 分析
    ↓
processSignal()         ← 步骤2：生成信号
    ↓
processDelivery()       ← 步骤3：推送给所有用户
    ↓
pushSignalToUsers()     ← 步骤4：逐用户推送
```

### 步骤详解

**步骤1：AI 分析 (processAnalysis)**
- 获取新闻记录
- 调用 `analyzeNewsItem()` 进行 AI 分析
- 更新新闻记录（摘要、影响分析）
- 返回分析结果

**步骤2：信号生成 (processSignal)**
- 调用 `generateSignal()` 生成交易信号
- 置信度 < 40：跳过，不生成信号
- 置信度 40-70：生成信号，推送纯资讯解读
- 置信度 >= 70：生成信号，推送交易建议
- 创建 Signal 记录入库

**步骤3：推送 (processDelivery)**
- 获取所有活跃用户
- 对每个用户执行风控检查
- 创建 SignalDelivery 记录
- 调用 Discord Bot 发送私信

### Worker 配置

```typescript
new Worker('news-processing', processFn, {
  connection,
  concurrency: 3,   // 最多同时处理 3 条新闻
})
```

**重试策略**：
```typescript
defaultJobOptions: {
  attempts: 3,                              // 最多重试 3 次
  backoff: { type: 'exponential', delay: 5000 }, // 指数退避
  removeOnComplete: 100,                    // 保留最近 100 条完成记录
  removeOnFail: 200,                        // 保留最近 200 条失败记录
}
```

### 自动初始化

Worker 在独立进程中运行，首次处理任务时自动初始化：
```typescript
async function ensureInitialized() {
  if (!isInitialized) {
    await initPostgres();
    await initRedis();
    await startDiscordBot();
    isInitialized = true;
  }
}
```

## 订单执行队列 (order-queue.ts)

### 处理流程

```
orderQueue.add('execute-order', { orderId })
    ↓
验证订单状态（幂等性）
    ↓
二次风控检查
    ↓
执行订单（Plan A 全自动 / Plan B 深链接）
    ↓
更新订单状态
    ↓
通知用户结果
```

### 幂等性保障

每个订单有唯一的 `orderToken`，防止重复执行：
```typescript
const existing = await getOrderByToken(orderToken);
if (existing) {
  logger.warn(`Order ${orderToken} already exists, skipping`);
  return;
}
```

## Redis 连接配置

```typescript
const connection = {
  host: 'localhost',
  port: 6379,
};
```

生产环境可通过环境变量配置：
```bash
REDIS_URL=redis://localhost:6379
```

## 监控和调试

### 查看队列状态

```bash
# 连接 Redis 查看队列
redis-cli
> KEYS bull:*
> LLEN bull:news-processing:wait
> LLEN bull:news-processing:active
> LLEN bull:news-processing:failed
```

### 查看失败任务

```typescript
const failed = await newsQueue.getFailed();
failed.forEach(job => {
  console.log(job.id, job.failedReason);
});
```

### 清理队列

```typescript
await newsQueue.clean(0, 100, 'failed');  // 清理失败任务
await newsQueue.drain();                   // 清空等待队列
```

