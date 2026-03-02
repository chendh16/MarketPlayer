调用 MCP 工具 `get_account`，查询指定用户的账户资金概况（总资产、现金、持仓比例）。

与 get_positions 区别：只返回资金摘要，不含持仓列表明细，响应更轻量。

参数解析规则：
- userId（必填）：数据库 users 表 UUID
- broker（可选，默认 futu）：futu | longbridge

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/get_account
Content-Type: application/json

{ "userId": "<uuid>", "broker": "longbridge" }
```

返回结构：
```json
{
  "userId": "...",
  "broker": "longbridge",
  "totalAssets": 626274.53,
  "availableCash": 155717.97,
  "totalPositionPct": 75.1,
  "source": "live | cache",
  "fetchedAt": "..."
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 get_account，简洁展示账户资金概况。
