调用 MCP 工具 `check_risk`，对指定用户和交易意图执行风控检查。

风控规则包含：
- 单标的持仓上限（user.customSinglePositionLimit）
- 总持仓上限（user.customTotalPositionLimit）
- 每日交易次数上限
- 风控等级（pass / warning / blocked）

参数解析规则：
- userId（必填）：数据库 users 表 UUID
- symbol（必填）：标的代码，如 AAPL、700.HK
- market（必填）：us | hk | a | btc
- direction（必填）：long | short
- positionPct（必填）：拟投入仓位百分比，如 5.0 表示 5%
- broker（可选，默认 longbridge）：futu | longbridge，风控查询哪个券商的持仓

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/check_risk
Content-Type: application/json

{
  "userId": "<uuid>",
  "symbol": "<symbol>",
  "market": "us | hk | a | btc",
  "direction": "long | short",
  "positionPct": 5.0,
  "broker": "longbridge"
}
```

返回结构：
```json
{
  "userId": "...",
  "symbol": "AAPL",
  "direction": "long",
  "positionPct": 5.0,
  "level": "pass | warning | blocked",
  "reasons": ["..."],
  "adjustedPositionPct": 5.0
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 check_risk，展示风控检查结果。
