# Skills 汇总

## 已创建的 Skill 服务器

### 1. 强势股筛选 (skill-strong-stock)
- 端口: 3102
- 协议: POST /
- 参数:
  ```json
  {
    "action": "screening",
    "parameters": {
      "limit": 20,
      "minChange": 5,
      "minVolume": 10,
      "minTurnover": 3
    }
  }
  ```
- 返回: 符合条件的强势股列表

### 2. 持仓复盘 (skill-position-review)
- 端口: 3103
- 协议: POST /
- 参数:
  ```json
  {
    "action": "review",
    "parameters": {
      "broker": "futu",
      "forceRefresh": false
    }
  }
  ```
- 返回: 持仓分析报告

### 3. 美股资讯 (skill-us-server)
- 端口: 3101
- 功能: Yahoo Finance RSS 美股新闻

---

## Skill 启动命令

```bash
# 强势股筛选
npx ts-node scripts/skill-strong-stock.ts

# 持仓复盘
npx ts-node scripts/skill-position-review.ts

# 美股资讯
npx ts-node scripts/skill-us-server.ts
```

---

## 使用方式

### 方式1: 直接调用 HTTP
```bash
curl -X POST http://localhost:3102/ \
  -H "Content-Type: application/json" \
  -d '{"action":"screening","parameters":{"limit":10}}'
```

### 方式2: 通过 MCP 工具调用
```typescript
// MCP 工具已注册
await fetch('http://localhost:3001/tools/fetch_top_gainers', {...})
```

---

## 定时任务配置

可配置 cron 定时执行:

```bash
# 每日收盘后筛选强势股
openclaw cron add \
  --name "每日强势股筛选" \
  --cron "0 15 * * 1-5" \
  --tz "Asia/Shanghai" \
  --message "执行强势股筛选并推送" \
  --announce
```
