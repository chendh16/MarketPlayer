# 资讯获取架构改造指南

## 📋 改造概述

MarketPlayer 的资讯获取系统已改造为**可插拔架构**，支持多种数据源：
- ✅ **传统 API**：REST API 调用
- ✅ **Skill**：技能调用框架
- ✅ **MCP**：Model Context Protocol
- ✅ **自定义**：任意自定义实现

---

## 🏗️ 架构设计

### 核心组件

```
┌─────────────────────────────────────────┐
│         NewsService (统一入口)           │
│  - 管理多个适配器                        │
│  - 按市场路由请求                        │
│  - 失败自动切换                          │
└─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┬───────────┐
        │           │           │           │
   ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐
   │   API   │ │ Skill  │ │  MCP   │ │ Custom │
   │ Adapter │ │Adapter │ │Adapter │ │Adapter │
   └─────────┘ └────────┘ └────────┘ └────────┘
        │           │           │           │
   ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐
   │ REST    │ │ Skill  │ │  MCP   │ │ 自定义  │
   │ API     │ │ 框架   │ │ 服务器 │ │ 实现    │
   └─────────┘ └────────┘ └────────┘ └────────┘
```

### 文件结构

```
src/services/news/
├── adapters/
│   ├── base.ts          # 适配器基础接口和工厂
│   ├── service.ts       # 统一资讯服务
│   ├── skill.ts         # Skill 适配器实现（待实现）
│   └── mcp.ts           # MCP 适配器实现（待实现）
├── sources/             # 原有实现（兼容）
│   ├── us-stock.ts
│   ├── hk-stock.ts
│   ├── a-stock.ts
│   └── btc.ts
└── filter.ts            # 预筛选规则
```

---

## 🔧 配置方式

### 方式 1: 环境变量配置

在 `.env` 文件中配置：

```bash
# 资讯适配器配置（JSON 格式）
NEWS_ADAPTERS='[
  {
    "name": "us-stock-skill",
    "type": "skill",
    "config": {
      "skillName": "market-data-fetcher",
      "timeout": 30000
    },
    "markets": ["us"],
    "priority": 1,
    "enabled": true
  },
  {
    "name": "btc-mcp",
    "type": "mcp",
    "config": {
      "server": "crypto-data-server",
      "tool": "fetch_crypto_news",
      "timeout": 30000
    },
    "markets": ["btc"],
    "priority": 1,
    "enabled": true
  }
]'
```

### 方式 2: 代码配置

在 `src/services/news/adapters/service.ts` 中修改 `getDefaultAdapters()` 函数。

---

## 📝 使用示例

### 示例 1: 使用传统 API

```typescript
import { newsService } from './adapters/service';

// 获取美股资讯
const result = await newsService.fetchNews({
  market: 'us',
  limit: 10,
  since: new Date(Date.now() - 3600000), // 最近1小时
});

console.log(`获取到 ${result.items.length} 条资讯`);
```

### 示例 2: 使用 Skill

```bash
# .env 配置
NEWS_ADAPTERS='[
  {
    "name": "us-stock-skill",
    "type": "skill",
    "config": {
      "skillName": "yahoo-finance-skill",
      "timeout": 30000
    },
    "markets": ["us"],
    "priority": 1,
    "enabled": true
  }
]'
```

### 示例 3: 使用 MCP

```bash
# .env 配置
NEWS_ADAPTERS='[
  {
    "name": "crypto-mcp",
    "type": "mcp",
    "config": {
      "server": "localhost:5000",
      "tool": "fetch_news",
      "timeout": 30000
    },
    "markets": ["btc"],
    "priority": 1,
    "enabled": true
  }
]'
```

### 示例 4: 自定义适配器

```typescript
import { NewsAdapterFactory } from './adapters/base';

// 注册自定义适配器
const customAdapter = NewsAdapterFactory.create('custom', {
  name: 'My Custom Adapter',
  fetchFunction: async (params) => {
    // 你的自定义实现
    const items = await myCustomFetch(params);
    return {
      items,
      source: 'custom',
      fetchedAt: new Date(),
    };
  },
  healthCheckFunction: async () => true,
});

NewsAdapterFactory.register('my-custom', customAdapter);
```

---

## 🔄 迁移步骤

### 步骤 1: 更新现有代码

修改 `src/services/scheduler/news-fetcher.ts`：

```typescript
// 旧代码
import { fetchUSStockNews } from '../news/sources/us-stock';
const newsItems = await fetchUSStockNews();

// 新代码
import { newsService } from '../news/adapters/service';
const result = await newsService.fetchNews({ market: 'us' });
const newsItems = result.items;
```

### 步骤 2: 配置适配器

在 `.env` 中添加配置或使用默认配置。

### 步骤 3: 实现 Skill/MCP 适配器

根据你的 Skill 或 MCP 框架实现具体的调用逻辑。

---

## 🛠️ 实现 Skill 适配器

### Skill 适配器接口

```typescript
// src/services/news/adapters/skill.ts

import { SkillCallParams } from './base';

export async function callSkill(params: SkillCallParams): Promise<any> {
  // TODO: 根据你的 Skill 框架实现
  
  // 示例：HTTP 调用
  const response = await fetch('http://skill-server/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skill: params.skillName,
      action: params.action,
      params: params.parameters,
    }),
  });
  
  return await response.json();
}
```

### 使用 Skill 适配器

```typescript
// 在 base.ts 的 SkillNewsAdapter 中引用
import { callSkill } from './skill';

private async callSkill(params: SkillCallParams): Promise<any> {
  return await callSkill(params);
}
```

---

## 🛠️ 实现 MCP 适配器

### MCP 适配器接口

```typescript
// src/services/news/adapters/mcp.ts

import { MCPCallParams } from './base';

export async function callMCP(params: MCPCallParams): Promise<any> {
  // TODO: 根据 MCP 协议实现
  
  // 示例：MCP 客户端调用
  const client = new MCPClient(params.server);
  const result = await client.callTool(params.tool, params.arguments);
  
  return result;
}
```

---

## ✅ 兼容性

### 向后兼容

原有的 `fetchUSStockNews()` 等函数仍然可用，但建议迁移到新架构。

### 渐进式迁移

可以同时使用新旧两种方式：
- 新功能使用 `newsService`
- 旧代码保持不变
- 逐步迁移

---

## 🎯 优势

### 1. 灵活性
- 支持多种数据源
- 轻松切换和扩展

### 2. 可靠性
- 自动失败切换
- 健康检查机制

### 3. 可维护性
- 统一接口
- 清晰的架构

### 4. 可扩展性
- 插件化设计
- 易于添加新适配器

---

## 📚 下一步

1. **实现 Skill 适配器**
   - 根据你的 Skill 框架实现 `callSkill()` 函数
   - 在 `src/services/news/adapters/skill.ts` 中实现

2. **实现 MCP 适配器**
   - 根据 MCP 协议实现 `callMCP()` 函数
   - 在 `src/services/news/adapters/mcp.ts` 中实现

3. **配置适配器**
   - 在 `.env` 中配置你的适配器
   - 或在代码中注册自定义适配器

4. **迁移现有代码**
   - 更新 `news-fetcher.ts` 使用新的 `newsService`
   - 测试验证

5. **添加监控**
   - 使用 `newsService.healthChec态
   - 记录日志和指标

---

## ❓ 常见问题

### Q: 如何添加新的数据源？

A: 创建新的适配器配置：

```bash
NEWS_ADAPTERS='[
  {
    "name": "my-new-source",
    "type": "api",  # 或 skill, mcp, custom
    "config": { ... },
    "markets": ["us"],
    "priority": 1,
    "enabled": true
  }
]'
```

### Q: 如何实现失败切换？

A: `NewsService` 会自动按优先级尝试所有适配器，直到成功或全部失败。

### Q: 如何监控适配器状态？

A: 使用健康检查：

```typescript
const health = await newsService.healthCheck();
for (const [name, healthy] of health) {
  console.log(`${name}: ${healthy ? '✅' : '❌'}`);
}
```

---

**需要帮助？** 查看 `src/services/news/adapters/base.ts` 了解详细接口定义。

