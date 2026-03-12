调用 GET /api/admin/costs，查询 AI 调用成本统计（需管理员权限）。

返回今日、本月的调用次数和费用，以及按类型（analyzeNews / generateSignal）的分类统计。

如尚未获取 adminToken，请先调用 admin-token skill。

参数解析规则：
- adminToken（必填）：管理员 JWT Bearer Token，通过 admin-token skill 获取

调用方式：
```
GET http://localhost:{PORT}/api/admin/costs
Authorization: Bearer <adminToken>
```

返回结构：
```json
{
  "today": {
    "call_count": 38,
    "total_cost_usd": "0.0450"
  },
  "thisMonth": {
    "call_count": 980,
    "total_cost_usd": "1.1500"
  },
  "byCallType": [
    { "call_type": "analyzeNews", "call_count": 600, "total_cost_usd": "0.7200" },
    { "call_type": "generateSignal", "call_count": 380, "total_cost_usd": "0.4300" }
  ]
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 admin-costs，展示今日和本月的 AI 成本统计，并按类型分类列出。
