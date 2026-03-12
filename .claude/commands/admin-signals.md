调用管理员接口，查看最新生成的交易信号列表（含推送统计）。

返回 AI 生成的信号列表，包含方向、置信度、建议仓位、推送统计等。信号有效期 15 分钟。

如尚未获取 adminToken，请先调用 admin-token skill。

参数解析规则：
- adminToken（必填）：管理员 JWT Bearer Token，通过 admin-token skill 获取
- limit（可选，默认 50）：返回条数上限，最大 100

调用方式：
```
GET http://localhost:{PORT}/api/admin/dashboard/signals?limit=<limit>
Authorization: Bearer <adminToken>
```

返回结构：
```json
[
  {
    "id": "...",
    "symbol": "AAPL",
    "market": "us",
    "direction": "long",
    "confidence": 82,
    "suggested_position_pct": 20,
    "reasoning": "...",
    "status": "generated | sent | expired | cancelled",
    "expires_at": "<ISO8601>",
    "created_at": "<ISO8601>"
  }
]
```

用法示例：
$ARGUMENTS

请根据上述参数调用信号列表接口，展示最新信号，标注方向和置信度，并汇总待处理推送数量。
