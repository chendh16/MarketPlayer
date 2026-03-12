调用 GET /api/admin/dashboard/stats，获取 MarketPlayer 系统聚合统计（需管理员权限）。

返回资讯总数/今日数/AI处理数、信号总数/均值置信度、订单成功数、推送状态分布等关键指标。

如尚未获取 adminToken，请先调用 admin-token skill。

参数解析规则：
- adminToken（必填）：管理员 JWT Bearer Token，通过 admin-token skill 获取

调用方式：
```
GET http://localhost:{PORT}/api/admin/dashboard/stats
Authorization: Bearer <adminToken>
```

返回结构：
```json
{
  "news": {
    "total": 1500,
    "today": 42,
    "aiProcessed": 1380,
    "pending": 120
  },
  "signals": {
    "total": 230,
    "today": 8,
    "avgConfidence": 72.5
  },
  "orders": {
    "total": 95,
    "today": 3,
    "filled": 80,
    "failed": 5
  },
  "deliveries": {
    "total": 230,
    "pending": 3,
    "confirmed": 80,
    "completed": 77
  }
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 admin-stats，展示系统聚合统计，重点突出今日资讯量、信号数和订单成功率。
