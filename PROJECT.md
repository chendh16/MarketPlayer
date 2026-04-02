# MarketPlayer — 项目进度快照

## 系统状态：Phase 1-3 全部完成 ✅
完成时间：2026-03-30
架构重构：2026-04-03 完成（回测两层分离 + 大盘过滤器）

## 当前运行状态
- **模式**：caution（大盘过滤器激活）
- **当前策略**：v1.0.1-filtered (rsi_oversold=40)
- **策略状态**：candidate_paper
- **市场状态**：SPY=655.84, MA50=683.22, 20d=-3.9%, status=caution
- **信号状态**：0个（当前被过滤）

## 策略验证数据（strategy-backtester）
- **回测区间**：2024-01-01 ~ 2026-03-20
- **交易数**：18笔
- **胜率**：55.6%（2025年64%）
- **Sharpe**：2.57
- **最大回撤**：19.2%

## 模拟盘观察期
观察周期：2026-03-29 至 2026-04-26（还剩约23天）
行业黑名单：semiconductors（NVDA/AMD等已过滤）
升级条件：模拟盘胜率 > 65%，最大亏损 < 25%，持续4周

## 架构重构 (2026-04-03) ✅
1. **回测两层分离**
   - 层1：signal-validator（从信号时间开始验证单个信号）
   - 层2：strategy-backtester（用2年历史数据跑策略参数）
2. **大盘趋势过滤器**
   - risk_on: SPY > MA50，正常交易
   - caution: SPY < MA50 但跌幅 < 8%，阈值提高到 0.4
   - risk_off: 跌幅 > 8%，暂停所有信号
3. **学习闭环修复**
   - WAL模式解决DB锁
   - 完整触发链路：daily-trigger → quant → strategy-backtester → evaluator → learning-agent
   - learning_actions 表已有3条记录

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
| backtest_runs | 10（包含1条策略级回测） |
| evaluation_results | 9 |
| learning_actions | 5 |
| strategy_evaluations | 1（策略级评估） |
| signal_candidates | 7 |

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
1. 读取 PROJECT.md + MEMORY.md
2. 检查当前 market_status（SPY vs MA50）
3. 报告最新 backtest_runs 的 win_rate 和 Sharpe
4. 如果有新的 learning_actions，汇报 hypothesis 内容
5. 确认当前信号是否被过滤（caution模式）
