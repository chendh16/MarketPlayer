调用 MCP 工具 `process_pipeline`，触发指定市场的完整资讯处理流程：
抓取 → 去重过滤 → 写入数据库 → 推入 BullMQ 队列 → 触发 AI 分析 → Discord 推送

等同于手动触发一次 cron 任务。

参数解析规则：
- market（必填）：us | hk | a | btc

调用方式：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/process_pipeline
Content-Type: application/json

{ "market": "<market>" }
```

返回结构：
```json
{ "ok": true, "market": "us" }
```

用法示例：
$ARGUMENTS

请根据上述参数调用 process_pipeline，触发流水线并报告执行结果。
