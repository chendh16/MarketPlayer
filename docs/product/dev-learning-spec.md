# Dev Learning Agent - 详细功能设计

---

## 功能 1: 技术资讯抓取 (Tech News Fetcher)

### 触发条件
- 每天 07:30 自动执行
- 支持手动触发

### 数据源

| 源 | URL | 关键词 | 频率 |
|----|-----|--------|------|
| Hacker News | https://news.ycombinator.com | AI, LLM, programming, copilot | 每日 |
| GitHub Trending | https://github.com/trending?since=weekly | ai, agent, copilot | 每日 |
| 36kr AI | https://www.36kr.com/information/AI/ | AI, 大模型 | 每日 |

### 输出格式

```json
{
  "date": "2026-03-11",
  "sources": [
    {
      "name": "HackerNews",
      "items": [
        { "title": "...", "url": "...", "score": 100 }
      ]
    }
  ]
}
```

### 报告模板

```
📰 今日技术热点 (2026-03-11)

🔥 HackerNews Top 5
1. [标题] (score: xxx)
   url

🔥 GitHub Trending
1. [项目名] - ⭐ xxx
   描述

💡 值得关注
- [技术点]: [简述]

---
```

---

## 功能 2: 依赖安全检查 (Dependency Auditor)

### 触发条件
- 每天 09:00 自动执行
- 支持手动触发

### 执行命令

```bash
npm audit --json > audit-report.json
```

### 检查项

| 检查项 | 命令 | 阈值 |
|--------|------|------|
| 安全漏洞 | npm audit | 高危 > 0 告警 |
| 过期依赖 | npm outdated | 有更新告警 |
| 未使用依赖 | depcheck | 列出可移除 |

### 报告模板

```
🔍 依赖健康报告 (2026-03-11)

⚠️ 安全漏洞: 2 个
- [package@version] - 漏洞描述 - severity: high

📦 可更新依赖: 5 个
- [package@current -> @latest]

🗑️ 未使用依赖: 3 个
- [package]

---
```

---

## 功能 3: 代码质量检查 (Code Quality Checker)

### 触发条件
- 每天 22:00 自动执行
- 支持手动触发

### 检查项

| 检查项 | 命令 | 告警条件 |
|--------|------|----------|
| TS编译 | npx tsc --noEmit | error > 0 |
| ESLint | npx eslint src/ | warning > 10 |
| 类型覆盖 | tsc --coverage | < 70% |

### 报告模板

```
🔧 代码质量报告 (2026-03-11)

📊 统计
- TS错误: 0
- ESLint警告: 3
- 覆盖: 75%

⚠️ 待修复
- [file:line] eslint warning

---
```

---

## 功能 4: 架构优化建议 (Architecture Advisor)

### 触发条件
- 每周六 10:00 自动执行
- 支持手动触发

### 分析维度

| 维度 | 指标 | 阈值 |
|------|------|------|
| 模块耦合 | 文件依赖数 | > 20 需拆分 |
| 代码行数 | 单文件行数 | > 500 需拆分 |
| 循环依赖 | 依赖图检测 | 有则告警 |
| 慢函数 | 性能 profiling | > 100ms |

### 报告模板

```
🏗️ 架构优化建议 (2026-03-11)

🔄 可重构模块
- src/services/trading/ - 建议拆分为多个子模块

⚡ 性能热点
- [function] 执行时间: 150ms

📉 技术债
- [file] 建议: 添加缓存

💡 架构演进建议
1. 引入依赖注入容器
2. 考虑迁移到微服务架构

---
```

---

## 调度配置

```typescript
// src/services/scheduler/dev-learning-scheduler.ts

export function startDevLearningScheduler() {
  // 07:30 - 技术资讯
  cron.schedule('30 7 * * *', () => techNewsFetcher.run());
  
  // 09:00 - 依赖检查
  cron.schedule('0 9 * * *', () => dependencyAuditor.run());
  
  // 22:00 - 代码质量
  cron.schedule('0 22 * * *', () => codeQualityChecker.run());
  
  // 周六 10:00 - 架构分析
  cron.schedule('0 10 * * 6', () => architectureAdvisor.run());
}
```

---

## 消息发送

- 早报 (07:30) → 发送到飞书
- 依赖报告 (09:00) → 发送到飞书
- 代码质量 (22:00) → 仅记录日志
- 架构建议 (周六) → 发送到飞书
