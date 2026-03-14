# HEARTBEAT.md

# 定时任务配置

## 每天 7:00 UTC+8 - 竞品分析

### 竞品分析报告
- 搜索 GitHub 上的 AI 投资助手竞品
- 分析新功能和特性
- 生成报告并通过飞书通知

### 数据源检查
- 检查 A股行情接口状态
- 检查 MCP 工具可用性

## 每天 22:00 UTC+8 - 代码验证与提交

### 验证任务
- 运行 `npx ts-node scripts/daily-verify.ts`
- 检查 TypeScript 编译
- 检查数据文件完整性
- 检查策略文件

### 提交任务
- Git add + commit + push
- 生成提交信息
