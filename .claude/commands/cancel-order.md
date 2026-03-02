调用 MCP 工具 `cancel_longbridge_order`，取消长桥已提交的订单。

注意：仅在 Mode A（全自动）下有实际效果。Mode B（深链接）/Mode C（通知）的订单未真实提交到长桥，无需取消。

参数解析规则：
- userId（必填）：数据库 users 表 UUID
- brokerOrderId（必填）：长桥返回的订单 ID（execute_longbridge_order 返回值中的 brokerOrderId）

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/cancel_longbridge_order
Content-Type: application/json

{
  "userId": "<uuid>",
  "brokerOrderId": "<longbridge-order-id>"
}
```

返回结构（成功）：
```json
{
  "success": true,
  "brokerOrderId": "...",
  "orderStatus": "cancelled"
}
```

返回结构（失败）：
```json
{
  "success": false,
  "failureType": "system_error",
  "failureMessage": "...",
  "orderStatus": "failed"
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 cancel_longbridge_order，取消指定长桥订单。
