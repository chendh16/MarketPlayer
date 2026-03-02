调用 MCP 工具 `execute_longbridge_order`，通过长桥直接执行下单（Agent 主动发起，绕过信号流程）。

下单模式由 `LONGBRIDGE_ORDER_MODE` 控制：
- Mode B（默认）：返回 deepLink，用户点击跳转长桥 App 确认
- Mode A：全自动下单（需交易权限）
- Mode C：纯通知，不执行下单

注意：此工具绕过 BullMQ 队列和风控引擎，Agent 调用前应先调用 check_risk 确认仓位合理。

参数解析规则：
- userId（必填）：数据库 users 表 UUID
- symbol（必填）：标的代码，如 700、AAPL（自动加后缀 .HK/.US）
- market（必填）：us | hk | a
- direction（必填）：buy | sell
- quantity（必填）：下单数量（股/手）
- referencePrice（可选）：参考价格，不填则市价单

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/execute_longbridge_order
Content-Type: application/json

{
  "userId": "<uuid>",
  "symbol": "700",
  "market": "hk",
  "direction": "buy",
  "quantity": 100,
  "referencePrice": 265.0
}
```

返回结构（Mode B deepLink）：
```json
{
  "success": true,
  "orderStatus": "submitted",
  "brokerOrderId": "LB-DEEPLINK-xxx",
  "deepLink": "longbridge://trade/order?symbol=700.HK&side=1&qty=100&price=265"
}
```

返回结构（Mode A 全自动）：
```json
{
  "success": true,
  "brokerOrderId": "1234567890",
  "orderStatus": "submitted"
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 execute_longbridge_order。下单前务必先用 check_risk 确认风控通过。
