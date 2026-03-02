调用 MCP 工具 `fetch_news`，从指定市场拉取最新资讯（只读，不写库）。

参数解析规则：
- market（必填）：us | hk | a | btc
- symbols（可选，逗号分隔）：如 AAPL,TSLA；不填则用 .env 默认配置
- limit（可选，整数）：返回条数上限，默认不限
- since（可选，ISO8601）：只返回此时间之后的资讯

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/fetch_news
Content-Type: application/json

{
  "market": "<market>",
  "symbols": ["<symbol1>", "<symbol2>"],
  "limit": <limit>,
  "since": "<ISO8601>"
}
```

返回结构：
```json
{
  "items": [ { "id": "...", "title": "...", "content": "...", "market": "...", "symbols": [], "publishedAt": "..." } ],
  "source": "alpha_vantage | yahoo_finance_hk | eastmoney | coingecko",
  "fetchedAt": "<ISO8601>",
  "total": 10
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 fetch_news，展示返回的资讯列表（标题 + 时间 + 来源）。
