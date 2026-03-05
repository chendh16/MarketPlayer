# Skill 服务器快速开始

## 一分钟启动

```bash
# 1. 启动所有 Skill 服务器
npx ts-node scripts/start-all-skills.ts

# 2. 在另一个终端测试
npx ts-node scripts/test-skills.ts
```

## 配置 NEWS_ADAPTERS

在 `.env` 文件中添加：

```bash
NEWS_ADAPTERS='[{"name":"us-skill","type":"skill","config":{"skillName":"us-stock-news","skillEndpoint":"http://localhost:3101","timeout":30000},"markets":["us"],"priority":5,"enabled":true},{"name":"a-skill","type":"skill","config":{"skillName":"a-stock-news","skillEndpoint":"http://localhost:3102","timeout":30000},"markets":["a"],"priority":5,"enabled":true},{"name":"hk-skill","type":"skill","config":{"skillName":"hk-stock-news","skillEndpoint":"http://localhost:3103","timeout":30000},"markets":["hk"],"priority":5,"enabled":true},{"name":"btc-skill","type":"skill","config":{"skillName":"btc-news","skillEndpoint":"http://localhost:3104","timeout":30000},"markets":["btc"],"priority":5,"enabled":true}]'
```

## 端口和服务

| 市场 | 端口 | 命令 |
|------|------|------|
| 美股 | 3101 | `npx ts-node scripts/skill-us-server.ts` |
| A股 | 3102 | `npx ts-node scripts/skill-a-server.ts` |
| 港股 | 3103 | `npx ts-node scripts/skill-hk-server.ts` |
| BTC | 3104 | `npx ts-node scripts/skill-btc-server.ts` |

## 健康检查

```bash
curl http://localhost:3101/health  # US
curl http://localhost:3102/health  # A
curl http://localhost:3103/health  # HK
curl http://localhost:3104/health  # BTC
```

## 测试数据获取

```bash
# 美股
curl -X POST http://localhost:3101/ \
  -H "Content-Type: application/json" \
  -d '{"action":"fetchNews","parameters":{"market":"us","limit":5}}'

# A股
curl -X POST http://localhost:3102/ \
  -H "Content-Type: application/json" \
  -d '{"action":"fetchNews","parameters":{"market":"a","limit":5}}'

# 港股
curl -X POST http://localhost:3103/ \
  -H "Content-Type: application/json" \
  -d '{"action":"fetchNews","parameters":{"market":"hk","limit":5}}'

# BTC
curl -X POST http://localhost:3104/ \
  -H "Content-Type: application/json" \
  -d '{"action":"fetchNews","parameters":{"market":"btc","limit":5}}'
```

## 常见问题

### Q: 端口被占用怎么办？

```bash
# 查看占用端口的进程
lsof -i :3101

# 杀死进程
kill -9 <PID>

# 或使用自定义端口
SKILL_US_PORT=4101 npx ts-node scripts/skill-us-server.ts
```

### Q: 服务器启动失败？

```bash
# 查看日志
tail -f /tmp/skill-us.log
tail -f /tmp/skill-a.log
tail -f /tmp/skill-hk.log
tail -f /tmp/skill-btc.log
```

### Q: 数据获取返回空？

这可能是正常的，如果当前没有新闻。检查：
1. 数据源是否可访问
2. 网络连接是否正常
3. API key 是否配置（BTC 可选）

### Q: 如何在生产环境部署？

参考：
- [SKILL_SERVERS_GUIDE.md](SKILL_SERVERS_GUIDE.md) - 详细部署指南
- [SKILL_CONFIG_EXAMPLES.md](SKILL_CONFIG_EXAMPLES.md) - Docker/K8s/PM2 配置

## 下一步

1. 阅读 [SKILL_SERVERS_GUIDE.md](SKILL_SERVERS_GUIDE.md) 了解详细配置
2. 查看 [SKILL_CONFIG_EXAMPLES.md](SKILL_CONFIG_EXAMPLES.md) 获取部署示例
3. 运行 `npm start` 启动主应用
4. 在 Discord 中查看推送的交易信号

## 架构图

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

## 相关命令

```bash
# 开发
npm run dev                          # 启动开发服务器
npx ts-node scripts/start-all-skills.ts  # 启动 Skill 服务器
npx ts-node scripts/test-skills.ts   # 测试 Skill 服务器

# 生产
docker-compose up -d                 # Docker 部署
pm2 start ecosystem.config.js        # PM2 部署
kubectl apply -f k8s/                # Kubernetes 部署

# 监控
pm2 logs                             # 查看日志
pm2 monit                            # 监控面板
docker-compose logs -f               # Docker 日志
```
