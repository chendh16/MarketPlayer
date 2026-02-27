# 08 — AI 调用成本控制

---

## 成本控制层级

```
全局日调用上限（硬限制）
    └── 用户日推送上限（软限制）
            └── 规则预筛选（无 AI 调用）
                    └── 模型分级（Haiku vs Sonnet）
```

---

## 调用量控制器

```typescript
// src/services/ai/cost-controller.ts

const AI_CALL_TYPES = ['summary', 'analysis', 'signal', 'confidence', 'personalized'] as const;
type AICallType = typeof AI_CALL_TYPES[number];

// 成本配置（基于 Claude API 公开定价，实际以 Anthropic 官网为准）
const COST_CONFIG = {
  'claude-sonnet-4-6': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'claude-haiku-4-5-20251001': { inputPer1M: 0.25, outputPer1M: 1.25 },
};

export async function checkAndIncrementCostCounter(callType: AICallType): Promise<void> {
  const today = getToday(); // YYYY-MM-DD
  const dailyKey = `ai:daily:calls:${today}`;

  // 读取当日总调用数
  const currentCount = Number(await redis.get(dailyKey) ?? 0);
  const limit = config.AI_DAILY_CALL_LIMIT; // 从环境变量读取，默认 500

  if (currentCount >= limit) {
    throw new AICallLimitExceededError(
      `Daily AI call limit reached: ${currentCount}/${limit}`
    );
  }

  // 原子递增
  const newCount = await redis.incr(dailyKey);

  // 设置到当天结束过期
  const secondsToMidnight = getSecondsToMidnight();
  await redis.expire(dailyKey, secondsToMidnight);

  // 阈值告警（80% 时告警）
  if (newCount >= limit * 0.8) {
    await sendCostAlert(`⚠️ AI 调用量已达今日上限 ${Math.round(newCount/limit*100)}%`);
  }
}

export async function checkUserDailyLimit(userId: string): Promise<void> {
  const today = getToday();
  const userKey = `user:daily:signals:${userId}:${today}`;

  const count = Number(await redis.get(userKey) ?? 0);
  const user = await getUser(userId);

  if (count >= user.dailySignalLimit) {
    throw new UserDailyLimitError(`User ${userId} daily signal limit reached`);
  }

  await redis.incr(userKey);
  await redis.expire(userKey, getSecondsToMidnight());
}

export async function logAICost(params: {
  callType: AICallType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  newsItemId?: string;
  userId?: string;
}): Promise<void> {
  const costConfig = COST_CONFIG[params.model as keyof typeof COST_CONFIG];
  if (!costConfig) return;

  const estimatedCost =
    (params.inputTokens / 1_000_000) * costConfig.inputPer1M +
    (params.outputTokens / 1_000_000) * costConfig.outputPer1M;

  await db.query(`
    INSERT INTO ai_cost_logs
    (call_type, model, input_tokens, output_tokens, estimated_cost_usd, news_item_id, user_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [
    params.callType, params.model,
    params.inputTokens, params.outputTokens,
    estimatedCost,
    params.newsItemId ?? null,
    params.userId ?? null,
  ]);

  // 实时监控：小时成本异常增长检测
  await checkHourlyCostAnomaly(estimatedCost);
}

async function checkHourlyCostAnomaly(latestCost: number) {
  const hourKey = `ai:hourly:cost:${getCurrentHour()}`;
  const hourlyCost = await redis.incrbyfloat(hourKey, latestCost);
  await redis.expire(hourKey, 3600);

  // 单小时超过 $5 触发告警
  if (hourlyCost > 5.0) {
    await sendCostAlert(`🚨 AI 小时成本异常：本小时已消耗 $${hourlyCost.toFixed(2)}`);
    // 超过 $10/小时 自动熔断
    if (hourlyCost > 10.0) {
      await activateEmergencyBrake();
    }
  }
}

// 紧急熔断：暂停所有 AI 调用
async function activateEmergencyBrake() {
  await redis.setEx('ai:emergency_brake', 3600, '1'); // 1小时熔断
  await sendCostAlert('🚨 AI 成本异常，已自动熔断，降级为纯资讯推送模式，持续1小时');
}

// 所有 AI 调用前检查熔断状态
export async function isEmergencyBrakeActive(): Promise<boolean> {
  const brake = await redis.get('ai:emergency_brake');
  return brake === '1';
}
```

---

## 成本估算参考

| 场景 | 日触发量 | 用户数 | 日成本估算 |
|------|---------|--------|-----------|
| 早期（10用户） | 50条 | 10 | ~$0.60/天 |
| 成长期（100用户） | 50条 | 100 | ~$2.00/天 |
| 财报季峰值（100用户） | 150条 | 100 | ~$5.85/天 |
| 规模期（1000用户） | 50条 | 1000 | ~$15.45/天 |

> 以上基于 Claude API 公开定价估算，实际费用以 Anthropic 官网为准。

---

## 个性化调用优化（批量合并）

```typescript
// 优化前：50条资讯 × 100用户 = 5000次个性化调用
// 优化后：50条通用分析 + 差异化补充，节省约 60%

export async function generatePersonalizedAnalysis(
  newsItem: NewsItem,
  analysis: AnalysisResult,
  userPositions: Position[]
): Promise<string | null> {
  // 检查用户是否持有相关标的（无持仓则跳过个性化调用）
  const relatedPositions = userPositions.filter(
    p => newsItem.symbols?.includes(p.symbol)
  );

  if (relatedPositions.length === 0) return null;

  await checkAndIncrementCostCounter('personalized');

  const positionSummary = relatedPositions
    .map(p => `${p.symbol}: ${p.positionPct.toFixed(1)}%`)
    .join(', ');

  const response = await anthropicClient.messages.create({
    model: 'claude-haiku-4-5-20251001', // 个性化分析用 Haiku 节省成本
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `基于以下资讯分析：${analysis.impact}

用户当前相关持仓：${positionSummary}

请用30字以内说明此资讯对用户现有持仓的具体影响（不要重复通用分析）。只返回影响说明文字，不要其他内容。`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  await logAICost({
    callType: 'personalized',
    model: 'claude-haiku-4-5-20251001',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    newsItemId: newsItem.id,
  });

  return text.trim();
}
```

---

## 质量熔断机制

```typescript
// src/services/ai/quality-monitor.ts

export async function recordSignalOutcome(
  signalId: string,
  outcome: 'correct' | 'incorrect'
): Promise<void> {
  // 滑动窗口：最近5条
  const key = 'signal:recent:outcomes';
  await redis.lpush(key, outcome);
  await redis.ltrim(key, 0, 4); // 保留最近5条

  const recent = await redis.lrange(key, 0, 4);
  const allIncorrect = recent.every(r => r === 'incorrect');

  if (allIncorrect && recent.length >= 5) {
    await triggerQualityCircuitBreaker('5_consecutive_incorrect');
  }
}

export async function checkWeeklyAccuracy(): Promise<void> {
  // 每天运行一次，检查本周正确率
  const weeklyStats = await getWeeklySignalStats();

  if (weeklyStats.total >= 10 && weeklyStats.accuracy < 0.40) {
    await triggerQualityCircuitBreaker('weekly_accuracy_below_40pct');
  }
}

async function triggerQualityCircuitBreaker(reason: string): Promise<void> {
  // 降级为纯资讯推送模式
  await redis.set('ai:quality_brake', reason);
  await sendAlert(`⚠️ AI 信号质量熔断：${reason}，已切换为纯资讯推送模式`);
}

export async function isQualityBrakeActive(): Promise<boolean> {
  const brake = await redis.get('ai:quality_brake');
  return !!brake;
}
```
