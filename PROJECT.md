# MarketPlayer — 项目进度快照

## 系统状态：Phase 1-3 全部完成 ✅
完成时间：2026-03-30

## 当前运行状态
模式：模拟盘观察期
当前策略：v1.0.1-filtered
策略状态：accepted_for_paper
观察周期：2026-03-29 至 2026-04-26（4周）
行业黑名单：semiconductors
升级条件：模拟盘胜率 > 65%，最大亏损 < 25%，持续4周

## Phase 1 ✅（2026-03-29完成）
- 消息传递、crontab、memory-store三张表
- 短线执行链跑通、risk-agent blocking gate

## Phase 2 ✅（2026-03-29完成）
- evaluator-agent、strategy-learning-agent
- 学习迭代闭环、routing-policy四条链路
- 状态机完整实现

## Phase 3 ✅（2026-03-30完成）
- 权限模型、audit_log、异常升级链路
- 多市场时间调度、跨团队同步hooks
- 通知分级三级全部接通

## memory-store 数据量
| 表名 | 记录数 |
|------|--------|
| signal_candidates | 7 |
| backtest_runs | 9 |
| strategy_versions | 3（v1.0.0 / v1.0.1 / v1.0.1-filtered）|
| evaluation_results | 9 |
| learning_actions | 2 |
| state_transitions | 15 |
| failure_cases | 4 |
| escalation_log | 2 |
| audit_log | 15+ |
| notification_log | 3 |

## 策略版本历史
| version | status | 说明 |
|----------|--------|-------|
| v1.0.0 | candidate | 初始版本 MA5/20 RSI30 |
| v1.0.1 | accepted_for_paper | RSI oversold优化 rsi_oversold:25 ma_long:15 |
| v1.0.1-filtered | accepted_for_paper | 排除半导体 胜率72.9% 平均+9.5% |

## 待处理事项
✅ 飞书群聊通知已接通（2026-03-30）
- chatId: oc_37474620bf065bb2a9dfb043a3e3ccf0
- Level 3 告警自动推送已测试通过

## 2026-04-26 模拟盘到期后执行
1. evaluator-agent 自动汇总4周表现
2. 如果胜率>65% 且最大亏损<25% → 升级为 accepted_for_live
3. strategy-learning-agent 基于模拟盘数据提出下一轮hypothesis
4. 生成 v1.1.0 候选版本

## 系统架构文件
- AGENTS.md：v2.1 agent分层配置
- HEARTBEAT.md：金融+开发双团队触发链
- permissions.json：四级权限模型
- agents/harness/utils/db.js：统一数据库写入
- agents/harness/utils/notify.js：三级通知工具
- memory-store/marketplayer.db：主数据库

## 下次对话启动方式
1. 读取 PROJECT.md + USER.md
2. 告知当前模拟盘进度和距离到期天数
3. 如有 evaluator 新评分则直接报告
4. 写入完成后告诉我，系统正式进入模拟盘观察期，等待2026-04-26评估结果

在此期间每次对话开始你先读 PROJECT.md，告诉我距离模拟盘到期还有几天，以及 notification_log 里有没有新的 Level 2/3 记录。
