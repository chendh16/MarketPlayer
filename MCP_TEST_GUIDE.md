# MCP 新闻服务测试指南

## 🎯 测试目标

验证 MarketPlayer 的 MCP 资讯获取功能是否正常工作。

---

## 📋 测试步骤

### 步骤 1: 启动 MCP 测试服务器

在**第一个终端**中运行：

```bash
npm run mcp-server
```

你应该看到：

```
=== MCP 新闻服务器已启动 ===
端口: 3001
健康检查: http://localhost:3001/health
新闻接口: http://localhost:3001/tools/fetch_news

支持的市场: us, btc, hk, a
```

**保持这个终端运行！**

---

### 步骤 2: 测试 MCP 服务器

在**第二个终端**中运行：

```bash
# 测试健康检查
curl http://localhost:3001/health

# 测试获取美股新闻
curl -X POST http://localhost:3001/tools/fetch_news \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"market": "us", "limit": 3}}'

# 测试获取 BTC 新闻
curl -X POST http://localhost:3001/tools/fetch_news \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"market": "btc", "limit": 2}}'
```

---

### 步骤 3: 运行 TypeScript 测试

在**第二个终端**中运行：

```bash
npm run test-mcp
```

你应该看到：

```
=== MCP 新闻服务测试 ===

✅ MCP 适配器已创建
   服务器: http://localhost:3001
   工具: fetch_news

🔍 执行健康检查...
   健康状态: ✅ 正常

📰 测试获取美股新闻...
✅ 成功获取 3 条新闻
   数据源: MCP: http://localhost:3001
   获取时间: 2026-02-28T...

📋 新闻列表：

1. Apple announces new iPhone with AI features
   市场: us
   标的: AAPL
   时间: 2026-02-28T...
   内容: Apple Inc. unveiled its latest iPhone model featuring advanced AI capabilities...

2. Tesla stock surges on strong delivery numbers
   市场: us
   标的: TSLA
   ...

📰 测试获取 BTC 新闻...
✅ 成功获取 2 条 BTC 新闻

=== 测试完成 ===
```

---

## 🔧 配置 MCP 服务器

### 在 .env 文件中配置

```bash
# MCP 服务器配置
MCP_NEWS_SERVER=http://localhost:3001
MCP_NEWS_TOOL=fetch_news

# 或者配置完整的适配器
NEWS_ADAPTERS='[
  {
    "name": "mcp-news",
    "type": "mcp",
    "config": {
      "server": "http://localhost:3001",
      "tool": "fetch_news",
      "timeout": 30000
    },
    "markets": ["us", "btc", "hk", "a"],
    "priority": 1,
    "enabled": true
  }
]'
```

---

## 📝 在代码中使用

### 方式 1: 直接使用 MCP 适配器

```typescript
import { NewsAdapterFactory } from './src/services/news/adapters/base';

// 创建 MCP 适配器
const mcpAdapter = NewsAdapterFactory.create('mcp', {
  server: 'http://localhost:3001',
  tool: 'fetch_news',
  timeout: 30000,
});

// 获取新闻
const result = await mcpAdapter.fetchNews({
  market: 'us',
  limit: 10,
});

console.log(`获取到 ${result.items.length} 条新闻`);
```

### 方式 2: 使用 NewsService

`ypescript
import { newsService } from './src/services/news/adapters/service';

// 配置后自动使用 MCP 适配器
const result = await newsService.fetchNews({
  market: 'us',
  limit: 10,
});
```

---

## 🛠️ 实现真实的 MCP 服务器

### MCP 协议要求

你的 MCP 服务器需要实现以下接口：

#### 1. 健康检查

```
GET /health
```

返回：
```json
{
  "status": "ok",
  "timestamp": "2026-02-28T..."
}
```

#### 2. 获取新闻工具

```
POST /tools/fetch_news
```

请求体：
```json
{
  "arguments": {
    "market": "us",
    "limit": 10,
    "since": "2026-02-28T..."
  }
}
```

返回：
```json
{
  "items": [
    {
      "title": "...",
      "content": "...",
      "market": "us",
      "symbols": ["AAPL"],
      "publishedAt": "...",
      "source": "...",
      "url": "...",
      "triggerType": "news"
    }
  ],
  "metadata": {
    "total": 10,
    "market": "us",
    "fetchedAt": "..."
  }
}
```

---

## 🎯 集成到 MarketPlayer

### 步骤 1: 配置环境变量

在 `.env` 文件中添加：

```bash
NEWS_ADAPTERS='[
  {
    "name": "production-mcp",
    "type": "mcp",
    "config": {
      "server": "https://your-mcp-server.com",
      "tool": "fetch_news",
      "timeout": 30000
    },
    "markets": ["us", "btc", "hk", "a"],
    "priority": 1,
    "enabled": true
  }
]'
```

### 步骤 2: 重启服务

```bash
npm run dev
```

### 步骤 3: 验证

查看日志确认 MCP 适配器已加载：

```
[info]: Initialized adapter: production-mcp (mcp) for markets: us, btc, hk, a
```

---

## ❓ 常见问题

### Q: MCP 服务器连接失败？

A: 检查：
1. MCP 服务器是否已启动
2. 服务器地址是否正确
3. 防火墙是否允许连接
4. 网络是否正常

### Q: 返回的数据格式不对？

A: 确保 MCP 服务器返回的数据符合 `NewsItem` 接口：
- `title`: 标题
- `content`: 内容
- `market`: 市场（us/hk/a/btc）
- `symbols`: 标的数组
- `publishedAt`: 发布时间
- `source`: 来源
- `url`: 链接
- `triggerType`: 触发类型

### Q: 如何调试 MCP 调用？

A: 查看日志：

```bash
tail -f logs/combined.log | grep MCP
```

---

## 📚 相关文档

- [NEWS_ADAPTER_GUIDE.md](../NEWS_ADAPTER_GUIDE.md) - 资讯适配器完整指南
- [src/services/news/adapters/base.ts](../src/services/news/adapters/base.ts) - 适配器接口定义
- [src/services/news/adapters/mcp.ts](../src/services/news/adapters/mcp.ts) - MCP 客户端实现

---

**测试成功后，你就可以使用 MCP 方式获取真实的市场资讯了！** 🎉

