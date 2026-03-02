调用 MCP 工具 `get_delivery`，查询单条信号推送记录的完整详情。

参数解析规则：
- deliveryId（必填）：signal_deliveries 表的 UUID

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/get_delivery
Content-Type: application/json

{
  "deliveryId": "<uuid>"
}
```

返回结构：
```json
{
  "id": "...",
  "userId": "...",
  "signalId": "...",
  "status": "pending | confirmed | order_placed | completed | order_failed | abandoned",
  "adjustedPositionPct": 5.0,
  "discordChannelId": "...",
  "discordMessageId": "...",
  "sentAt": "...",
  "orderToken": "..."
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 get_delivery，返回该推送记录详情。
