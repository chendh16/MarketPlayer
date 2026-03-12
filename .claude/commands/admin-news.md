调用管理员接口，查看最新入库的资讯列表（含 AI 处理状态）。

news_items 表记录所有抓取到的原始资讯，包括标题、来源、市场、相关标的、AI 分析结果等。

如尚未获取 adminToken，请先调用 admin-token skill。

参数解析规则：
- adminToken（必填）：管理员 JWT Bearer Token，通过 admin-token skill 获取
- limit（可选，默认 50）：返回条数上限，最大 100

调用方式：
```
GET http://localhost:{PORT}/api/admin/dashboard/news?limit=<limit>
Authorization: Bearer <adminToken>
```

返回结构：
```json
[
  {
    "id": "...",
    "title": "...",
    "source": "...",
    "market": "us",
    "symbols": ["AAPL", "MSFT"],
    "ai_summary": "...",
    "ai_impact_analysis": "...",
    "ai_processed": true,
    "ai_processed_at": "<ISO8601>",
    "published_at": "<ISO8601>",
    "created_at": "<ISO8601>"
  }
]
```

用法示例：
$ARGUMENTS

请根据上述参数调用资讯列表接口，展示最新入库资讯，标注 ai_processed 状态，并统计今日入库数量。
