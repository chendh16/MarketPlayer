调用 MCP 工具 `get_broker_balance`，直接查询券商账户余额，无需 userId，适合快速探测账户状态。

与 get_positions 区别：
- get_broker_balance：不需要 userId，强制实时拉取，适合 Agent 状态探测
- get_positions：需要 userId，有 Redis 缓存，返回手动持仓

支持券商：
- longbridge：长桥（推荐，已验证可用）
- futu：富途（需 OpenD 运行且已开通 OpenAPI 权限）

参数解析规则：
- broker（必填）：futu | longbridge
- userId（可选，默认 system）：用于日志记录

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/get_broker_balance
Content-Type: application/json

{ "broker": "longbridge" }
```

返回结构：
```json
{
  "broker": "longbridge",
  "totalAssets": 626274.53,
  "availableCash": 155717.97,
  "totalPositionPct": 75.1,
  "positions": [
    { "symbol": "700.HK", "quantity": 300, "marketValue": 79560, "positionPct": 12.7 }
  ],
  "fetchedAt": "..."
}
```

用法示例：
$ARGUMENTS

请调用 get_broker_balance 查询指定券商余额，以简洁格式展示账户概况和各标的持仓。
