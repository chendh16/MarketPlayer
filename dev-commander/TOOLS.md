# TOOLS.md – dev-commander 工具配置

## 子 Agent 团队

### app-agent
- 用途：产品研究、竞品分析、GitHub 开源框架搜索
- 调用时机：需要了解外部产品动态或技术选型时
- 注意：研究结果必须经用户确认才能排期

### pm-agent
- 用途：任务拆解、排期、进度跟踪
- 调用时机：有确认好的任务需要执行时
- 传递：任务描述、优先级、验收标准

### dev-agent
- 用途：开发、修复 Bug
- 调用时机：通过 pm-agent 间接调用

### test-agent
- 用途：自动化测试、验收
- 调用时机：通过 pm-agent 间接调用

### ops-agent
- 用途：运维、监控、部署
- 调用时机：上线前后，或生产环境异常时

## 项目信息

- 项目根目录：/workspace/MarketPlayer
- 源码：/workspace/MarketPlayer/src
- 测试：/workspace/MarketPlayer/tests
- 日志：/workspace/MarketPlayer/logs
- 配置：/workspace/MarketPlayer/.env