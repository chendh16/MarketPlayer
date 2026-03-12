# Skill 服务器部署指南

## 概述

MarketPlayer 使用统一的 Skill 协议来获取各市场的资讯数据。所有市场（美股、A股、港股、BTC）都通过独立的 Skill 服务器提供数据。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    MarketPlayer 主应用                       │
│                  (src/services/news/adapters)               │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┬───────────────┐
         │               │               │               │
    ┌────▼────┐    ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
    │ US Skill│    │ A Skill │    │ HK Skill│    │BTC Skill│
    │  :3101  │    │  :3102  │    │  :3103  │    │  :3104  │
    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘
         │              │              │              │
    Yahoo RSS      新浪财经       Yahoo RSS      CoinGecko
                   东方财富                       CoinDesk
```

## Skill 服务器列表

| 市场 | 服务器 | 端口 | 数据源 | API Key |
|------|--------|------|--------|---------|
| 美股 | skill-us-server.ts | 3101 | Yahoo Finance RSS | 不需要 |
| A股 | skill-a-server.ts | 3102 | 新浪财经 → 东方财富 | 不需要 |
| 港股 | skill-hk-server.ts | 3103 | Yahoo Finance RSS | 不需要 |
| BTC | skill-btc-server.ts | 3104 | CoinGecko → CoinDesk | 可选 |

## 快速开始

### 1. 启动所有 Skill 服务器

```bash
# 使用统一启动脚本（推荐）
npx ts-node scripts/start-all-skills.ts

# 或单独启动
npx ts-node scripts/skill-us-server.ts   # 美股 :3101
npx ts-node scripts/skill-a-server.ts    # A股 :3102
npx ts-node scripts/skill-hk-server.ts   # 港股 :3103
npx ts-node scripts/skill-btc-server.ts  # BTC :3104
```

### 2. 配置环境变量

在 `.env` 文件中配置 NEWS_ADAPTERS：

```bash
NEWS_ADAPTERS='[
  {"name":"us-skill","type":"skill","config":{"skillName":"us-stock-news","skillEndpoint":"http://localhost:3101","timeout":30000},"markets":["us"],"priority":5,"enabled":true},
  {"name":"a-skill","type":"skill","config":{"skillName":"a-stock-news","skillEndpoint":"http://localhost:3102","timeout":30000},"markets":["a"],"priority":5,"enabled":true},
  {"name":"hk-skill","type":"skill","config":{"skillName":"hk-stock-news","skillEndpoint":"http://localhost:3103","timeout":30000},"markets":["hk"],"priority":5,"enabled":true},
  {"name":"btc-skill","type":"skill","config":{"skillName":"btc-news","skillEndpoint":"http://localhost:3104","timeout":30000},"markets":["btc"],"priority":5,"enabled":true}
]'
```

### 3. 验证服务器状态

```bash
# 健康检查
curl http://localhost:3101/health  # US
curl http://localhost:3102/health  # A
curl http://localhost:3103/health  # HK
curl http://localhost:3104/health  # BTC

# 测试获取资讯
curl -X POST http://localhost:3101/ \
  -H "Content-Type: application/json" \
  -d '{"action":"fetchNews","parameters":{"market":"us","limit":5}}'
```

## Skill 协议规范

### 请求格式

```typescript
POST /
Content-Type: application/json

{
  "skill": "market-news",           // Skill 名称（可选）
  "action": "fetchNews",            // 操作：fetchNews
  "parameters": {
    "market": "us" | "a" | "hk" | "btc",  // 市场
    "symbols": ["AAPL", "GOOGL"],   // 可选：指定股票代码
    "limit": 20                     // 可选：返回数量限制
  }
}
```

### 响应格式

```typescript
{
  "items": [
    {
      "source": "yahoo_finance_us",
      "externalId": "https://...",
      "title": "Apple announces...",
      "content": "Full article text...",
      "url": "https://...",
      "market": "us",
      "symbols": ["AAPL"],
      "triggerType": "news",
      "aiProcessed": false,
      "publishedAt": "2026-03-05T10:00:00Z"
    }
  ],
  "metadata": {
    "source": "yahoo_finance_rss",
    "fetchedAt": "2026-03-05T10:05:00Z"
  }
}
```

### 健康检查

```
GET /health

Response: { "status": "ok", "service": "us-stock-skill" }
```

## 端口配置

通过环境变量自定义端口：

```bash
SKILL_US_PORT=3101   # 美股服务器端口
SKILL_A_PORT=3102    # A股服务器端口
SKILL_HK_PORT=3103   # 港股服务器端口
SKILL_BTC_PORT=3104  # BTC服务器端口
```

## 数据源详情

### 美股 (US Stock)
- **主要源**: Yahoo Finance RSS
- **URL**: `https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US`
- **默认股票**: AAPL, GOOGL, MSFT, TSLA, NVDA, AMZN, META, NFLX, SPY, QQQ
- **API Key**: 不需要
- **限流**: 无

### A股 (A Stock)
- **主要源**: 新浪财经滚动新闻
- **URL**: `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516`
- **备用源**: 东方财富公告
- **API Key**: 不需要
- **限流**: 无
- **特性**: 自动提取股票代码（6位数字）

### 港股 (HK Stock)
- **主要源**: Yahoo Finance RSS
- **URL**: `https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=HK`
- **默认股票**: 0700.HK, 9988.HK, 0941.HK, 1810.HK, 2318.HK, 3690.HK, 1024.HK, 9618.HK
- **API Key**: 不需要
- **限流**: 无

### BTC
- **主要源**: CoinGecko News API
- **URL**: `https://api.coingecko.com/api/v3/news`
- **备用源**: CoinDesk RSS
- **API Key**: 可选（`COINGECKO_API_KEY`）
- **限流**: 免费层 10-50 req/min
- **降级**: 自动降级到 CoinDesk RSS

## 生产部署

### Docker 部署

```dockerfile
# Dockerfile.skills
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

# 暴露所有 Skill 服务器端口
EXPOSE 3101 3102 3103 3104

CMD ["npx", "ts-node", "scripts/start-all-skills.ts"]
```

```yaml
# docker-compose.yml
services:
  skill-servers:
    build:
      context: .
      dockerfile: Dockerfile.skills
    ports:
      - "3101:3101"  # US
      - "3102:3102"  # A
      - "3103:3103"  # HK
      - "3104:3104"  # BTC
    environment:
      - COINGECKO_API_KEY=${COINGECKO_API_KEY}
    restart: unless-stopped
```

### PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动所有服务器
pm2 start scripts/skill-us-server.ts --name skill-us
pm2 start scripts/skill-a-server.ts --name skill-a
pm2 start scripts/skill-hk-server.ts --name skill-hk
pm2 start scripts/skill-btc-server.ts --name skill-btc

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

### Systemd 服务

```ini
# /etc/systemd/system/marketplayer-skills.service
[Unit]
Description=MarketPlayer Skill Servers
After=network.target

[Service]
Type=simple
User=marketplayer
WorkingDirectory=/opt/marketplayer
ExecStart=/usr/bin/npx ts-node scripts/start-all-skills.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable marketplayer-skills
sudo systemctl start marketplayer-skills
sudo systemctl status marketplayer-skills
```

## GitHub Actions 集成

Skill 服务器已集成到 `.github/workflows/market-news.yml`：

```yaml
- name: Start all Skill servers
  run: |
    npx ts-node scripts/skill-us-server.ts  > /tmp/skill-us.log  2>&1 &
    npx ts-node scripts/skill-a-server.ts   > /tmp/skill-a.log   2>&1 &
    npx ts-node scripts/skill-hk-server.ts  > /tmp/skill-hk.log  2>&1 &
    npx ts-node scripts/skill-btc-server.ts > /tmp/skill-btc.log 2>&1 &
    sleep 15
    # 健康检查...
```

## 故障排查

### 服务器无法启动

```bash
# 检查端口占用
lsof -i :3101
lsof -i :3102
lsof -i :3103
lsof -i :3104

# 查看日志
tail -f /tmp/skill-us.log
tail -f /tmp/skill-a.log
tail -f /tmp/skill-hk.log
tail -f /tmp/skill-btc.log
```

### 数据获取失败

```bash
# 测试数据源连通性
curl -I https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL
curl -I https://feed.mix.sina.com.cn/api/roll/get
curl -I https://api.coingecko.com/api/v3/news

# 检查 DNS 解析
nslookup feeds.finance.yahoo.com
nslookup feed.mix.sina.com.cn
nslookup api.coingecko.com
```

### 性能优化

```bash
# 增加超时时间
export SKILL_TIMEOUT=60000

# 减少并发请求
# 修改各服务器的 DEFAULT_SYMBOLS 数量

# 启用缓存（在主应用中配置）
export NEWS_CACHE_TTL=300  # 5分钟缓存
```

## 监控和日志

### 日志格式

所有 Skill 服务器使用统一的日志格式：

```
[Skill-US] action=fetchNews market=us
[Skill-US] Returning 20 US items
[Skill-A] 新浪财经: 30 条
[Skill-HK] fetchSymbolRSS(0700.HK) failed: timeout
[Skill-BTC] CoinGecko: 10 items
```

### 监控指标

建议监控以下指标：

- 服务器可用性（/health 端点）
- 响应时间（P50, P95, P99）
- 错误率
- 数据源降级次数
- 返回的资讯数量

## 迁移指南

### 从内置源迁移到 Skill 服务器

1. 启动 Skill 服务器
2. 配置 NEWS_ADAPTERS 环境变量
3. 重启主应用
4. 验证数据获取正常
5. 可选：禁用内置源（通过 priority 控制）

### 从 MCP 迁移到 Skill

A股服务器已从 MCP 协议迁移到 Skill 协议：

**旧配置 (MCP)**:
```json
{
  "name": "a-mcp",
  "type": "mcp",
  "config": {
    "server": "http://localhost:3102",
    "tool": "fetch_news"
  }
}
```

**新配置 (Skill)**:
```json
{
  "name": "a-skill",
  "type": "skill",
  "config": {
    "skillName": "a-stock-news",
    "skillEndpoint": "http://localhost:3102"
  }
}
```

## 最佳实践

1. **使用统一启动脚本**: `start-all-skills.ts` 提供统一管理
2. **配置健康检查**: 定期检查 /health 端点
3. **设置合理超时**: 默认 30 秒，可根据网络情况调整
4. **启用日志轮转**: 避免日志文件过大
5. **监控数据源状态**: 及时发现数据源失效
6. **配置降级策略**: 主数据源失败时自动切换备用源
7. **定期更新依赖**: 保持 Node.js 和依赖包最新

## 相关文档

- [NEWS_ADAPTER_GUIDE.md](../NEWS_ADAPTER_GUIDE.md) - Adapter 系统详细文档
- [12-NEWS-SOURCES.md](../dev-docs/12-NEWS-SOURCES.md) - 数据源配置文档
- [MCP_TEST_GUIDE.md](../MCP_TEST_GUIDE.md) - MCP 协议测试指南

## 支持

如有问题，请查看：
- GitHub Issues
- 项目文档
- 日志文件
