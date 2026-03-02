调用 MCP 工具 `analyze_news`，对已入库的资讯条目执行 AI 分析。

分析内容：
- summary：50字以内中文摘要
- impact：市场影响分析
- sentiment：positive | negative | neutral
- importance：high | medium | low

分析结果写入数据库 news_items 表并返回。
调用前提：newsItemId 对应的资讯已通过 fetch_news / process_pipeline 写入数据库。

参数解析规则：
- newsItemId（必填）：数据库中 news_items 表的 UUID

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/analyze_news
Content-Type: application/json

{ "newsItemId": "<uuid>" }
```

返回结构：
```json
{
  "newsItemId": "...",
  "summary": "...",
  "impact": "...",
  "sentiment": "positive | negative | neutral",
  "importance": "high | medium | low"
}
```

用法示例：
$ARGUMENTS

请根据上述 newsItemId 调用 analyze_news，展示 AI 分析结果。
