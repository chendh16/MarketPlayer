调用 GET /api/health，检查 MarketPlayer 系统健康状态（只读）。

调用方式：
```
GET http://localhost:{PORT}/api/health
```

返回结构：
```json
{
  "status": "ok",
  "timestamp": "<ISO8601>"
}
```

用法示例：
$ARGUMENTS

请调用 get-health，展示系统当前健康状态和时间戳。
