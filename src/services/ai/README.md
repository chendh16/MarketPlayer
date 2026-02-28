# AI 分析模块

## 架构概览

```
src/services/ai/
├── base.ts       # AI 提供商接口和工厂
└── analyzer.ts   # 新闻分析和信号生成
```

## 可插拔 AI 架构

通过 `.env` 配置切换不同的 AI 提供商：

```bash
AI_PROVIDER=anthropic  # anthropic | openai | azure | custom
AI_API_KEY=sk-ant-api03-xxx
AI_MODEL=claude-sonnet-4-20250514
```

### 支持的提供商

| 提供商 | 配置 | 模型 | 成本 |
|--------|------|------|------|
| Anthropic | `AI_PROVIDER=anthropic` | Claude Sonnet 4 | ~$0.003/次 |
| OpenAI | `AI_PROVIDER=openai` | GPT-4 Turbo | ~$0.01/次 |
| Azure OpenAI | `AI_PROVIDER=azure` | 自定义部署 | 按量计费 |
| 自定义 API | `AI_PROVIDER=custom` | 兼容 OpenAI 格式 | 自定义 |

## 核心功能

### 1. 新闻分析 (`analyzeNewsItem`)

**输入**：新闻标题、内容、市场、标的
**输出**：
```typescript
{
  summary: string;           // 简短摘要
  impact_analysis: string;   // 影响分析
  key_points: string[];      // 关键要点
  sentiment: 'positive' | 'negative' | 'neutral';
  importance: 'high' | 'medium' | 'low';
}
```

**成本**：~$0.0035/次

### 2. 信号生成 (`generateSignal`)

**输入**：新闻 + AI 分析结果
**输出**：
```typescript
{
  should_generate: boolean;  // 是否生成信号
  confidence: number;        // 置信度 0-100
  direction: 'long' | 'short' | 'neutral';
  position_pct: number;      // 建议仓位 1-20%
  reasoning: string;         // 推理依据
}
```

**成本**：~$0.0030/次

**规则**：
- `confidence < 40` 时不生成信号
- `confidence < 70` 时推送纯资讯解读（无交易按钮）
- `confidence >= 70` 时推送交易信号（带确认按钮）

## 成本控制

### 调用限制

```bash
AI_DAILY_CALL_LIMIT=500           # 每日最大调用次数
AI_HOURLY_COST_ALERT_USD=5.0      # 小时成本告警阈值
AI_HOURLY_COST_BRAKE_USD=10.0     # 小时成本熔断阈值
```

### 成本记录

每次 AI 调用都会记录到 `ai_cost_logs` 表：
- 调用类型（analysis / signal）
- 模型名称
- Token 使用量
- 成本金额
- 关联的新闻 ID

查看成本报告：
```bash
npm run cost-report
```

## JSON 解析增强

自动处理 AI 返回的 markdown 代码块：
```typescript
// AI 可能返回：```json\n{...}\n```
// 自动去除包装，提取纯 JSON
const rawContent = response.content
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```\s*$/i, '')
  .trim();
const result = JSON.parse(rawContent);
```

## 扩展新 AI 提供商

1. 在 `base.ts` 中实现 `AIProvider` 接口：
```typescript
class CustomProvider implements AIProvider {
  async chat(messages, options) { ... }
  estimateCost(usage) { ... }
}
```

2. 在 `AIProviderFactory.create()` 中注册：
```typescript
case 'custom':
  return new CustomProvider(config);
```

3. 配置 `.env`：
```bash
AI_PROVIDER=custom
AI_API_BASE_URL=https://your-api.com/v1
AI_API_KEY=your-key
```

## 提示词优化

当前提示词位于 `analyzer.ts` 中，针对中国投资者优化：
- 关注 A股/港股/美股/BTC 市场
- 保守的交易建议（宁可不推也不要推错）
- 明确的风险提示
- 符合中国投资者习惯的表达

可根据实际效果调整提示词以提高准确率。

