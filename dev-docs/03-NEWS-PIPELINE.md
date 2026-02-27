# 03 — 资讯抓取 & AI 处理流水线

---

## 整体流程

```
定时抓取（每5分钟）
    ↓
规则预筛选（不调用 AI）
    ↓
写入 news_items 表 + 推入 BullMQ 队列
    ↓
AI Worker 消费队列
    ↓
调用1：摘要 + 影响分析（Claude Sonnet）
调用2：交易参考 + 置信度（Claude Sonnet）
    ↓
生成 signals 记录
    ↓
推入推送队列 → 触发 Discord 推送
```

---

## 各市场抓取配置

```typescript
// src/services/news/sources/config.ts
export const FETCH_CONFIGS = {
  us: {
    interval: '*/5 * * * *',        // 每5分钟
    tradingHours: { start: '22:30', end: '05:00', timezone: 'Asia/Shanghai' },
    premarketHours: { start: '04:00', end: '22:30' },
  },
  hk: {
    interval: '*/5 * * * *',
    tradingHours: { start: '09:30', end: '16:00', timezone: 'Asia/Shanghai' },
  },
  a: {
    interval: '*/5 * * * *',
    tradingHours: { start: '09:30', end: '15:00', timezone: 'Asia/Shanghai' },
  },
  btc: {
    interval: '0 */4 * * *',         // 每4小时（非交易时段限制）
    tradingHours: null,              // 全天
    maxSignalsPerDay: 6,
  },
};
```

---

## 规则预筛选

**在调用 AI 之前过滤，减少 30-40% 无效调用：**

```typescript
// src/services/news/filter.ts
export interface FilterResult {
  pass: boolean;
  reason?: string;
}

export function preFilter(newsItem: RawNewsItem): FilterResult {
  // 规则1：涨跌幅过滤（仅对市场异动类）
  if (newsItem.triggerType === 'anomaly') {
    const changePercent = Math.abs(newsItem.changePercent ?? 0);
    if (changePercent < 3) {
      return { pass: false, reason: 'change_below_threshold' };
    }
  }

  // 规则2：重复去重（同一标的1小时内已处理）
  const recentKey = `news:recent:${newsItem.symbol}:${newsItem.market}`;
  const isRecent = await redis.get(recentKey);
  if (isRecent) {
    return { pass: false, reason: 'duplicate_within_1h' };
  }

  // 规则3：BTC 每4小时限制
  if (newsItem.market === 'btc') {
    const btcKey = `btc:signal:count:${getCurrentHourBlock()}`;
    const count = await redis.get(btcKey);
    if (Number(count) >= 1) {
      return { pass: false, reason: 'btc_rate_limit' };
    }
  }

  // 规则4：AI 日调用上限检查
  const todayCalls = await redis.get(`ai:daily:calls:${getToday()}`);
  if (Number(todayCalls) >= config.AI_DAILY_CALL_LIMIT) {
    return { pass: false, reason: 'daily_call_limit_reached' };
  }

  return { pass: true };
}

// 通过后设置去重标记
export async function markAsProcessed(symbol: string, market: string) {
  const key = `news:recent:${symbol}:${market}`;
  await redis.setEx(key, 3600, '1'); // 1小时去重
}
```

---

## AI 处理层

```typescript
// src/services/ai/analyzer.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// 调用1：摘要 + 影响分析（合并，Claude Sonnet）
export async function analyzNewsItem(newsItem: NewsItem): Promise<AnalysisResult> {
  await checkAndIncrementCostCounter('analysis');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `你是一个专业的金融分析师。请分析以下资讯并以 JSON 格式返回结果。

资讯标题：${newsItem.title}
资讯内容：${newsItem.content ?? ''}
市场：${newsItem.market}
相关标的：${newsItem.symbols?.join(', ')}

请返回以下 JSON（不要包含其他文字）：
{
  "summary": "50字以内的中文摘要",
  "impact": "对市场和相关标的的潜在影响分析（100字以内）",
  "sentiment": "positive | negative | neutral",
  "importance": "high | medium | low"
}`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const result = JSON.parse(text);

  // 记录成本
  await logAICost({
    callType: 'analysis',
    model: 'claude-sonnet-4-6',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    newsItemId: newsItem.id,
  });

  return result;
}

// 调用2：交易参考 + 置信度（合并，Claude Sonnet）
export async function generateSignal(
  newsItem: NewsItem,
  analysis: AnalysisResult
): Promise<SignalResult | null> {
  await checkAndIncrementCostCounter('signal');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `你是一个专业的股票交易信号分析师。基于以下分析，生成交易参考信号。

资讯摘要：${analysis.summary}
市场影响：${analysis.impact}
情绪：${analysis.sentiment}
标的：${newsItem.symbols?.join(', ')}

请返回以下 JSON（不要包含其他文字）：
{
  "should_generate": true/false,
  "direction": "long | short",
  "confidence": 0-100的数字,
  "suggested_position_pct": 建议仓位百分比(1-20之间),
  "reasoning": "简短的决策依据（50字以内）",
  "key_risk": "主要风险提示"
}

注意：
- confidence < 40 时 should_generate 应为 false
- 这是信号参考，不是投资建议
- 要保守，宁可不推也不要推错误信号`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const result = JSON.parse(text);

  await logAICost({
    callType: 'signal',
    model: 'claude-sonnet-4-6',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    newsItemId: newsItem.id,
  });

  if (!result.should_generate || result.confidence < 40) return null;

  return result;
}
```

---

## BullMQ 队列配置

```typescript
// src/queues/news-queue.ts
import { Queue, Worker } from 'bullmq';

export const newsQueue = new Queue('news-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const newsWorker = new Worker('news-processing', async (job) => {
  const { newsItemId } = job.data;
  const newsItem = await getNewsItem(newsItemId);

  // 步骤1：AI 分析
  const analysis = await analyzNewsItem(newsItem);
  await updateNewsItem(newsItemId, {
    aiSummary: analysis.summary,
    aiImpactAnalysis: analysis.impact,
    aiProcessed: true,
    aiProcessedAt: new Date(),
  });

  // 步骤2：生成信号
  const signalResult = await generateSignal(newsItem, analysis);
  if (!signalResult) {
    // 置信度不足，只推送资讯解读
    await pushNewsOnlyToUsers(newsItem, analysis);
    return;
  }

  // 步骤3：创建 Signal 记录
  const signal = await createSignal({
    newsItemId: newsItem.id,
    symbol: newsItem.symbols![0],
    market: newsItem.market,
    direction: signalResult.direction,
    confidence: signalResult.confidence,
    suggestedPositionPct: signalResult.suggested_position_pct,
    reasoning: signalResult.reasoning,
  });

  // 步骤4：推入推送队列
  await signalDeliveryQueue.add('deliver-signal', { signalId: signal.id });

}, { connection: redisConnection, concurrency: 3 });
```

---

## 交易时段检查

```typescript
// src/utils/market-hours.ts
import { DateTime } from 'luxon';

export function isMarketOpen(market: 'us' | 'hk' | 'a' | 'btc'): boolean {
  if (market === 'btc') return true;

  const now = DateTime.now().setZone('Asia/Shanghai');
  const time = now.hour * 100 + now.minute;

  switch (market) {
    case 'a':
      return time >= 930 && time <= 1500;
    case 'hk':
      return time >= 930 && time <= 1600;
    case 'us':
      return time >= 2230 || time <= 500;
    default:
      return false;
  }
}

export function getPreMarketWarning(market: string): string | null {
  const now = DateTime.now().setZone('Asia/Shanghai');
  const time = now.hour * 100 + now.minute;

  // A股开盘前30分钟
  if (market === 'a' && time >= 900 && time < 930) {
    return '距A股开盘不足30分钟，请注意评估最新行情';
  }
  // 港股开盘前30分钟
  if (market === 'hk' && time >= 900 && time < 930) {
    return '距港股开盘不足30分钟，请注意评估最新行情';
  }
  // 美股开盘前30分钟
  if (market === 'us' && time >= 2200 && time < 2230) {
    return '距美股开盘不足30分钟，请注意评估最新行情';
  }

  return null;
}
```
