调用 GET /api/users/:userId/signals，查询指定用户的交易信号推送历史（只读）。

userId 是数据库 users 表的 UUID，不是 Discord 用户 ID。如需从 Discord ID 获取 UUID，请先调用 get-user。

参数解析规则：
- userId（必填）：数据库 users 表 UUID，如 550e8400-e29b-41d4-a716-446655440000
- limit（可选，整数）：返回条数上限，默认 50

调用方式：
```
GET http://localhost:{PORT}/api/users/<userId>/signals?limit=<limit>
```

返回结构：
```json
[
  {
    "id": "<uuid>",
    "signalId": "<uuid>",
    "symbol": "AAPL",
    "market": "us",
    "direction": "long | short",
    "confidence": 85,
    "suggestedPositionPct": 5.0,
    "reasoning": "...",
    "status": "pending | confirmed | ignored | expired | completed",
    "sentAt": "<ISO8601>"
  }
]
```

用法示例：
$ARGUMENTS

请根据上述参数调用 get-user-signals，展示该用户的信号历史列表（标的 + 方向 + 置信度 + 状态）。
