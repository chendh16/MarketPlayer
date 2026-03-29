# AGENTS.md - Agent Team Structure v2.1

## 三层结构

```
commander（总指挥）
├── Harness Engine
│   ├── trigger-engine
│   ├── routing-policy
│   └── evaluator-agent
├── strategy-learning-agent  # 从dev团队独立，跨团队共享
│   - 基于evaluator评分和memory-store历史进行策略演化
│   - 提出hypothesis，驱动下一轮backtest
│   - 不参与当前候选信号的最终审批
│   - 学习链异步运行，不阻塞执行链
├── dev-commander
│   ├── app-agent
│   ├── pm-agent
│   ├── dev-agent
│   ├── test-agent（blocking gate）
│   │   - 角色：开发侧质量门禁
│   │   - 未通过不得触发deploy-hook
│   │   - override由dev-commander批准
│   ├── ops-agent
│   └── dev-learning-agent
└── fin-commander
    ├── 情报层
    │   ├── data-agent
    │   ├── strategy-agent
    │   └── market-agent
    ├── 研究层
    │   ├── quant-agent
    │   └── value-agent
    ├── 验证层
    │   ├── backtest-agent
    │   └── risk-agent（blocking gate）
    │       - 角色：硬闸门
    │       - 未通过不得进入调度层
    │       - override由commander批准
    └── 调度层
        └── fin-commander
```

## Agent 职责说明

### Harness Engine

- **trigger-engine**: 定时/事件触发入口
- **routing-policy**: 路由决策，四条链路独立调度
- **evaluator-agent**: 策略评估评分

### strategy-learning-agent

- 基于 evaluator 评分和 memory-store 历史进行策略演化
- 提出 hypothesis，驱动下一轮 backtest
- 不参与当前候选信号的最终审批
- 学习链异步运行，不阻塞执行链

### dev-commander

- **app-agent**: 技术开发 + 竞品分析 + GitHub开源框架调研
- **pm-agent**: 任务排期 + 进度跟踪
- **dev-agent**: 开发 + 修复 Bug
- **test-agent**: 自动化测试 + 验收 (blocking gate)
- **ops-agent**: 运维 + 监控
- **dev-learning-agent**: 工程侧学习（不参与策略学习）

### fin-commander

#### 情报层
- **data-agent**: 数据收集 + 清洗
- **strategy-agent**: 金融策略收集 + 策略研究 + TradingView 等平台调研
- **market-agent**: 综合分析 + 实时提醒

#### 研究层
- **quant-agent**: 短中线量化策略
- **value-agent**: 长线价值研究

#### 验证层
- **backtest-agent**: 回测验证
- **risk-agent**: 风控审核 (blocking gate)
  - 硬闸门，未通过不得进入调度层
  - override 必须由 commander 批准并写入 memory-store

#### 调度层
- **fin-commander**: 任务分发 + 结果汇总

## Agent Index

| agent_id | label | 层级 | 上级 | blocking_gate |
|---------|-------|------|------|---------------|
| commander | commander | L0 | 用户 | - |
| trigger-engine | harness/trigger | L1 | commander | - |
| routing-policy | harness/routing | L1 | commander | - |
| evaluator-agent | harness/evaluator | L1 | commander | - |
| strategy-learning-agent | shared/strategy-learning | L1 | commander | - |
| fin-commander | fin/commander | L2 | commander | - |
| dev-commander | dev/commander | L2 | commander | - |
| data-agent | fin/intel/data | L3 | fin-commander | - |
| strategy-agent | fin/intel/strategy | L3 | fin-commander | - |
| market-agent | fin/intel/market | L3 | fin-commander | - |
| quant-agent | fin/research/quant | L3 | fin-commander | - |
| value-agent | fin/research/value | L3 | fin-commander | - |
| backtest-agent | fin/verify/backtest | L3 | fin-commander | - |
| risk-agent | fin/verify/risk | L3 | fin-commander | ✅ |
| pm-agent | dev/coord/pm | L3 | dev-commander | - |
| app-agent | dev/exec/app | L3 | dev-commander | - |
| dev-agent | dev/exec/dev | L3 | dev-commander | - |
| test-agent | dev/support/test | L3 | dev-commander | ✅ |
| ops-agent | dev/support/ops | L3 | dev-commander | - |
| dev-learning-agent | dev/support/learning | L3 | dev-commander | - |

## Blocking Gate

共 2 个 blocking gate：
- **risk-agent**: 金融硬闸门，override 需 commander 批准
- **test-agent**: 开发质量门禁，override 需 dev-commander 批准

---

## 开发顺序

1. Phase 1: Multi-Agent 执行链跑通 ✅
2. Phase 2: 学习迭代闭环 + routing-policy + 状态机 ✅
3. Phase 3: 权限模型 + 审计 + 异常升级

---

更新时间: 2026-03-29