# TOOLS.md - pm-agent 工具配置

## 子 Agent 团队

### dev-agent
- 用途：开发新功能、修复 Bug
- 调用时机：需要写代码或改代码时
- 传递信息：任务描述、验收标准、相关文件路径

### test-agent
- 用途：自动化测试、功能验收
- 调用时机：dev-agent 完成开发后
- 传递信息：需要测试的功能、测试路径、期望行为

### ops-agent
- 用途：监控运维、部署上线、日志排查
- 调用时机：上线前检查、生产环境异常时
- 传递信息：部署内容、需要检查的服务和日志

## 项目信息

### 代码路径
- 主项目：/workspace/MarketPlayer
- 源码：/workspace/MarketPlayer/src
- 测试：/workspace/MarketPlayer/tests
- 日志：/workspace/MarketPlayer/logs

### 技术栈
- 后端：Node.js / TypeScript
- 数据库：PostgreSQL / MySQL + Redis
- 测试框架：Jest + Playwright
- 进程管理：PM2

## 搜索工具

### Tavily
- 用途：查技术文档、金融行业资讯、API 文档
- 适用场景：需要了解外部信息时使用