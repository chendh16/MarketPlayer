# AI Trading Assistant — 开发文档索引

**项目版本：** V1.0  
**基于：** PRD V6.0  
**日期：** 2026-02-27  
**用途：** 交给 AI Coding Agent 执行开发

---

## 文档列表

| 文档 | 内容 | 优先级 |
|------|------|--------|
| 01-OVERVIEW.md | 项目概览、技术栈、目录结构 | 必读 |
| 02-DATA-MODELS.md | 数据库 Schema、数据结构定义 | 必读 |
| 03-NEWS-PIPELINE.md | 资讯抓取 + AI 处理流水线 | Phase 1 |
| 04-RISK-ENGINE.md | 风控引擎逻辑 | Phase 1 |
| 05-DISCORD-BOT.md | Discord Bot 交互设计 | Phase 1 |
| 06-ORDER-EXECUTION.md | 下单执行层 + 富途对接 | Phase 1 |
| 07-API-ROUTES.md | 后端 API 接口定义 | Phase 1 |
| 08-COST-CONTROL.md | AI 调用成本控制 | Phase 1 |
| 09-STATE-MACHINE.md | 建议生命周期状态机 | Phase 1 |
| 10-ENV-CONFIG.md | 环境变量 + 部署配置 | 必读 |

---

## 开发顺序

```
Step 1: 读 01-OVERVIEW + 02-DATA-MODELS，搭建项目骨架和数据库
Step 2: 03-NEWS-PIPELINE，实现资讯抓取和 AI 处理
Step 3: 04-RISK-ENGINE，实现风控规则引擎
Step 4: 05-DISCORD-BOT，实现推送和交互
Step 5: 06-ORDER-EXECUTION，实现富途下单对接
Step 6: 07-API-ROUTES，补全 REST API
Step 7: 08-COST-CONTROL + 09-STATE-MACHINE，补全控制层逻辑
```

---

## 核心约束（开发前必读）

1. **人工确认永不可绕过**：任何情况下不得自动下单，必须等用户 Discord 确认
2. **下单幂等性**：每条建议有唯一 OrderToken，同一 Token 只处理一次
3. **状态全量持久化**：所有建议状态写入 PostgreSQL，不存内存
4. **Discord 3秒 ACK**：按钮交互必须 3 秒内响应，先 deferReply 再异步处理
5. **下单前二次验证**：用户确认时必须实时拉取富途最新持仓，不用缓存
6. **风控声明**：每条推送必须显示"风控仅覆盖富途账户"声明
7. **免责声明**：每条推送底部必须显示免责声明
