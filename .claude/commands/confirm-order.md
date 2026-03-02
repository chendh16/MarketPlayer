调用 MCP 工具 `confirm_order`，确认执行信号推送对应的下单操作。

流程：
1. 验证 deliveryId 存在且未过期
2. 验证 orderToken 有效（防止重复/伪造）
3. 执行风控检查（可选 overrideWarning）
4. 将下单任务推入 BullMQ order queue
5. 返回 jobId，异步执行富途/长桥下单

注意：COLD_START_MODE=true 时此操作不会真实下单，仅记录。

参数解析规则：
- deliveryId（必填）：signal_deliveries 表 UUID
- orderToken（必填）：推送记录中的 orderToken，防重放
- overrideWarning（可选，默认 false）：true 则跳过 warning 级风控，强制下单

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/confirm_order
Content-Type: application/json

{
  "deliveryId": "<uuid>",
  "orderToken": "<token>",
  "overrideWarning": false
}
```

返回结构（成功）：
```json
{ "queued": true, "jobId": "order-job-xxx" }
```

返回结构（风控阻止）：
```json
{ "queued": false, "reason": "Risk check blocked: 持仓超限" }
```

用法示例：
$ARGUMENTS

请根据上述参数调用 confirm_order。下单前务必确认用户已知晓风险。
