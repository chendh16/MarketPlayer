# MarketPlayer Multi-Agent 架构设计 v2.1

> 创建时间: 2026-03-29
> 状态: Phase 1 执行中

## 背景

目标：策略研究到学习迭代的全自动闭环，覆盖 A股/港股/美股三个市场。

---

## 整体结构

```
用户
└── commander
 ├── Harness Engine
 │ ├── trigger-engine
 │ ├── routing-policy
 │ └── evaluator-agent
 ├── strategy-learning-agent
 ├── fin-commander
 │ ├── 情报层：data-agent / strategy-agent / market-agent
 │ ├── 研究层：quant-agent / value-agent
 │ ├── 验证层：backtest-agent / risk-agent（blocking gate）
 │ └── 调度层：fin-commander
 └── dev-commander
 ├── 执行层：app-agent / dev-agent
 ├── 协调层：pm-agent
 └── 支撑层：dev-learning-agent / test-agent（blocking gate）/ ops-agent
```

---

## Agent 索引

| agent_id | label | 层级 | 上级 | blocking_gate |
|----------|-------|------|------|------|---------------|
| commander | commander | L0 | 用户 | — |
| trigger-engine | harness/trigger | L1 | commander | — |
| routing-policy | harness/routing | L1 | commander | — |
| evaluator-agent | harness/evaluator | L1 | commander | — |
| strategy-learning-agent | shared/strategy-learning | L1 | commander | — |
| fin-commander | fin/commander | L2 | commander | — |
| dev-commander | dev/commander | L2 | commander | — |
| data-agent | fin/intel/data | L3 | fin-commander | — |
| strategy-agent | fin/intel/strategy | L3 | fin-commander | — |
| market-agent | fin/intel/market | L3 | fin-commander | — |
| quant-agent | fin/research/quant | L3 | fin-commander | — |
| value-agent | fin/research/value | L3 | fin-commander | — |
| backtest-agent | fin/verify/backtest | L3 | fin-commander | — |
| risk-agent | fin/verify/risk | L3 | fin-commander | ✅ |
| pm-agent | dev/coord/pm | L3 | dev-commander | — |
| app-agent | dev/exec/app | L3 | dev-commander | — |
| dev-agent | dev/exec/dev | L3 | dev-commander | — |
| test-agent | dev/support/test | L3 | dev-commander | ✅ |
| ops-agent | dev/support/ops | L3 | dev-commander | — |
| dev-learning-agent | dev/support/learning | L3 | dev-commander | — |

**Blocking Gate (2个):**
- risk-agent: 金融硬闸门
- test-agent: 开发质量门禁
- override 均需对应上级 commander 批准

---

## Phase 1 — 让系统跑起来

### 1. memory-store 基础版

**三张核心表：**

```sql
-- strategy_versions
CREATE TABLE strategy_versions (
 version_id TEXT PRIMARY KEY,
 parent_version_id TEXT,
 strategy_type TEXT,
 target_market TEXT,
 params TEXT,
 status TEXT,
 created_by TEXT,
 created_at TEXT,
 notes TEXT
);

-- backtest_runs
CREATE TABLE backtest_runs (
 run_id TEXT PRIMARY KEY,
 strategy_version_id TEXT,
 annual_return REAL,
 sharpe REAL,
 win_rate REAL,
 max_drawdown REAL,
 profit_factor REAL,
 score REAL,
 verdict TEXT,
 created_at TEXT
);

-- signal_candidates
CREATE TABLE signal_candidates (
 signal_id TEXT PRIMARY KEY,
 source_strategy_version TEXT,
 symbol TEXT,
 market TEXT,
 direction TEXT,
 confidence REAL,
 current_status TEXT,
 risk_result TEXT,
 created_at TEXT
);
```

### 2. HEARTBEAT.md 定时触发配置

| 触发 | 时间 | 内容 |
|-------|------|------|
| A股收盘 | 15:30 CST | 短线执行链（A股） |
| 港股收盘 | 16:00 HKT | 短线执行链（港股） |
| 美股收盘 | 16:00 EST | 短线执行链（美股） |
| 行情扫描 | */5 * * * * | 高频扫描 |
| 每周复盘 | 周六 10:00 | 策略复盘链 |
| 每月估值 | 月初 09:00 | 长线价值链 |

### 3. 金融团队短线执行链

```
trigger-engine → routing-policy → data-agent → quant-agent
→ backtest-agent → evaluator-agent → risk-agent（blocking gate）
→ fin-commander → market-agent 输出候选摘要
```

**输入输出 Schema (risk-agent 为例):**
```json
{
 "type": "risk_result",
 "result": "pass/fail",
 "reason": "string",
 "risk_level": "low/mid/high",
 "position_hint": "float|null",
 "stop_loss_rule": "object|null",
 "override_required": "boolean",
 "timestamp": "ISO8601"
}
```

### 4. 通知分级

| 级别 | 发送目标 | 触发条件 |
|------|---------|----------|
| Level 3 | commander + 飞书/微信 | 回撤超阈值、连续亏损、数据源故障、风控拒绝 |

---

## Phase 2 — 让系统能学习

### 扩展表

```sql
-- evaluation_results
CREATE TABLE evaluation_results (
 eval_id TEXT PRIMARY KEY,
 strategy_version_id TEXT,
 sharpe REAL,
 win_rate REAL,
 max_drawdown REAL,
 score REAL,
 verdict TEXT,
 created_at TEXT
);

-- learning_actions
CREATE TABLE learning_actions (
 action_id TEXT PRIMARY KEY,
 base_version_id TEXT,
 action_type TEXT,
 new_params TEXT,
 hypothesis TEXT,
 confidence REAL,
 result_version_id TEXT,
 created_at TEXT
);

-- failure_cases
CREATE TABLE failure_cases (
 case_id TEXT PRIMARY KEY,
 agent_id TEXT,
 error_type TEXT,
 context TEXT,
 resolved BOOLEAN,
 created_at TEXT
);
```

### 状态机

**候选信号：**
```
intel_collected → research_generated → backtest_pending
→ backtest_passed / backtest_failed
→ risk_review_pending → approved / rejected
→ notified → archived
```

**策略版本：**
```
draft → candidate → backtested → evaluated
→ accepted_for_paper → accepted_for_live → deprecated
```

---

## Phase 3 — 让系统可治理

### 权限模型

| agent | read | propose | approve | execute |
|-------|------|--------|---------|---------|
| quant-agent | intel/历史策略/回测 | signal/params/hypothesis | — | — |
| backtest-agent | strategy_version/历史数据 | backtest_result | — | 执行回测 |
| risk-agent | candidate/持仓/drawdown | position_hint/stop_rule | risk_pass/fall | — |
| commander | 全局 | override | high-risk | 最终批准 |

### 审计表

```sql
CREATE TABLE audit_log (
 log_id TEXT PRIMARY KEY,
 event_type TEXT,
 agent_id TEXT,
 input_summary TEXT,
 output_summary TEXT,
 version TEXT,
 operator TEXT,
 timestamp TEXT
);
```

### 异常升级链路

```
agent 自检 → routing-policy 判断
→ 自动重试（最多3次，指数退避）
→ 熔断 → 升级对应 commander
→ 人工审批 → 写入 override 记录
```

---

## 验收标准

### Phase 1
- [x] 三张表建好，可读写
- [x] 三市场定时触发正常，高频扫描独立运行
- [x] commander 三层结构消息传递正常
- [x] 短线执行链跑通一次完整流程
- [x] risk-agent blocking gate 生效
- [x] Level 3 告警推送到飞书/微信

### Phase 2
- [ ] evaluator-agent 输出结构化评分
- [ ] strategy-learning-agent 产出 hypothesis
- [ ] 学习迭代闭环跑通
- [ ] 三张新表建好

### Phase 3
- [ ] 权限边界配置完成
- [ ] audit_log 表完整
- [ ] 三类 hook 配置完成
- [ ] 异常升级链路生效
- [ ] Level 1/2/3 通知全部接通