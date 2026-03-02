调用 MCP 工具 `get_deliveries`，查询信号推送记录列表。

signal_deliveries 表记录每次向用户推送信号的详情，包括：
- 推送时间、用户、信号ID
- 推送状态（pending / confirmed / rejected / expired）
- 下单令牌（orderToken，用于 confirm_order）

参数解析规则：
- userId（可选）：过滤指定用户，不填则返回所有用户
- status（可选）：pending | confirmed | rejected | expired
- limit（可选，默认 50）：返回条数上限

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/get_deliveries
Content-Type: application/json

{ "userId": "<uuid>", "status": "pending", "limit": 20 }
```

返回结构：
```json
{
  "deliveries": [
    {
      "id": "...",
      "signalId": "...",
      "userId": "...",
      "status": "pending",
      "orderToken": "...",
      "sentAt": "...",
      "expiresAt": "..."
    }
  ],
  "total": 5
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 get_deliveries，列出推送记录并标注状态。
