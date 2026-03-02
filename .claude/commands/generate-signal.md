调用 MCP 工具 `generate_signal`，基于已分析的资讯生成交易参考信号。

信号内容：
- direction：long | short
- confidence：0-100 置信度（< 40 不生成）
- suggestedPositionPct：建议仓位百分比
- reasoning：决策依据
- keyRisk：主要风险

信号写入 signals 表，供风控引擎和 Discord 推送使用。
调用前提：必须先对该 newsItemId 执行 analyze_news（ai_processed=true）。

参数解析规则：
- newsItemId（必填）：已完成 AI 分析的资讯 UUID

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/generate_signal
Content-Type: application/json

{ "newsItemId": "<uuid>" }
```

返回结构（生成成功）：
```json
{
  "generated": true,
  "signalId": "...",
  "direction": "long",
  "confidence": 75,
  "suggestedPositionPct": 5,
  "reasoning": "...",
  "keyRisk": "..."
}
```

返回结构（置信度不足）：
```json
{ "generated": false, "reason": "Confidence too low or shouldGenerate=false" }
```

用法示例：
$ARGUMENTS

请根据上述 newsItemId 调用 generate_signal，展示信号生成结果。
