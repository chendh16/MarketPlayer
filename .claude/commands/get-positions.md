调用 MCP 工具 `get_positions`，查询指定用户的持仓快照（含缓存，60秒内复用）。

同时返回：
- 券商实时持仓（futu 或 longbridge）
- 数据库手动持仓（manual_positions 表）

支持券商：
- futu：富途（需 OpenD 运行）
- longbridge：长桥（需 LONGPORT_* 环境变量配置）

参数解析规则：
- userId（必填）：数据库 users 表 UUID
- broker（可选，默认 futu）：futu | longbridge
- forceRefresh（可选，默认 false）：true 则跳过缓存实时拉取

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/get_positions
Content-Type: application/json

{
  "userId": "<uuid>",
  "broker": "futu | longbridge",
  "forceRefresh": false
}
```

返回结构：
```json
{
  "userId": "...",
  "broker": "longbridge",
  "snapshot": {
    "totalAssets": 626274.53,
    "availableCash": 155717.97,
    "positions": [ { "symbol": "700.HK", "quantity": 300, "marketValue": 79560, "positionPct": 12.7 } ],
    "totalPositionPct": 75.1,
    "source": "live | cache",
    "fetchedAt": "..."
  },
  "manualPositions": [],
  "fetchedAt": "..."
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 get_positions，以表格形式展示持仓详情。
