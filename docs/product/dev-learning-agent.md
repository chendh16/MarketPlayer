# Dev Learning Agent - 技术自学习配置

## Agent: learning-agent

**职责**: 提升整个 Agent 团队和 OpenClaw 的基建能力

**定位**: 基础设施类 (Infra) - 不直接获取竞品，专注于技术基建

---

## 核心任务

### 1. OpenClaw ClawHub 研究 (P0)
- 监控 https://clawhub.com 最新技能/工具
- 分析新技能是否适用于本产品
- 评估技术可行性和集成成本

### 2. OpenClaw 官方文档 (P0)
- 关注 OpenClaw 更新日志
- 新功能研究和使用
- 最佳实践探索

### 3. 代码质量检查 (日常)
- 依赖安全: `npm audit` 检查漏洞
- TypeScript: 确保编译零错误
- 死代码: 识别未使用函数/变量

---

## 技术研究领域

| 优先级 | 领域 | 说明 |
|--------|------|------|
| P0 | OpenClaw 技能 | ClawHub 最新技能 |
| P0 | AI编程工具 | Cursor, Windsurf, Claude Code |
| P0 | 大模型应用 | RAG, Agent, Function Calling |
| P1 | 前端框架 | React, Vue, Solid 最新动态 |
| P1 | Node.js | 新版本特性, 性能优化 |
| P2 | 数据库 | 向量数据库, 新SQL引擎 |

---

## 数据源

| 来源 | URL | 任务 |
|------|-----|------|
| ClawHub | https://clawhub.com | 最新技能 |
| OpenClaw Docs | https://docs.openclaw.ai | 新功能 |
| Hacker News | news.ycombinator.com | 技术热点 |
| GitHub | github.com/trending | 项目趋势 |

---

## 输出格式

每日技术简报:
```
## 🎯 OpenClaw 基建更新
- [新技能/工具评估]: 适用性分析

## 🔥 技术热点
1. [标题] - 来源

## ⚙️ 代码质量
- 依赖漏洞: X个(高危X)
- TS错误: X个

## 💡 优化建议
1. [模块] - 建议
```

---

## Cron 调度

| 时间 | 任务 |
|------|------|
| 07:30 | OpenClaw 技能研究 |
| 07:45 | 技术资讯抓取 |
| 20:00 | AI编程工具研究 |
| 22:00 | 代码质量报告 |

---

## 分类说明

- **基建类 (Infra)**: learning-agent - 基础设施、技术能力提升
- **竞品类**: app-agent - 竞品分析、产品调研
