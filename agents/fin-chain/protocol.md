# Agent Contract - 统一通信协议

## Phase 1: Commander 三层结构

```
你（用户）
└── commander（异常处理/高风险审批/override）
    ├── dev-commander（开发团队）
    │   ├── app-agent
    │   ├── dev-agent
    │   └── pm-agent
    └── fin-commander（金融团队）
        ├── data-agent
        ├── quant-agent
        ├── backtest-agent
        ├── evaluator-agent
        ├── risk-agent（blocking gate）
        └── market-agent
```

## 跨层级消息传递

### sessions_spawn 用法

```javascript
// 启动 fin-commander 主控
sessions_spawn({
  agentId: "fin-commander",
  label: "fin-commander",      // 区分不同 commander
  task: "执行短线策略执行链",
  mode: "session",         // 持久化
  thread: true
})
```

### sessions_send 用法

```javascript
// fin-commander 内部调度
sessions_send({
  label: "fin-commander",
  message: JSON.stringify({ // 必须 JSON
    action: "next_agent",
    target: "data-agent",
    payload: { market: "美股" }
  })
})
```

## JSON 输入输出标准

### data-agent
```json
// 输入
{
  "action": "collect",
  "market": "美股",
  "symbols": ["AAPL", "MSFT"]
}
// 输出
{
  "status": "success",
  "data": [...],
  "timestamp": "2026-03-29T15:30:00Z"
}
```

### quant-agent
```json
// 输入
{
  "action": "generate_signal",
  "market": "美股",
  "data": [...]  // from data-agent
}
// 输出
{
  "status": "success",
  "signals": [
    {
      "symbol": "AAPL",
      "direction": "call",
      "confidence": 0.75,
      "reason_tags": ["放量突破", "RSI超卖"]
    }
  ]
}
```

### backtest-agent
```json
// 输入
{
  "action": "backtest",
  "signal": {...},
  "params": {...}
}
// 输出
{
  "status": "success",
  "run_id": "bt_20260329_001",
  "result": {
    "annual_return": 0.12,
    "sharpe": 1.8,
    "max_drawdown": 0.08
  }
}
```

### evaluator-agent
```json
// 输入
{
  "action": "evaluate",
  "backtest_result": {...}
}
// 输出
{
  "status": "success",
  "score": 72,
  "verdict": "candidate_paper",
  "annual_return": 0.12,
  "sharpe": 1.8,
  "win_rate": 0.45,
  "max_drawdown": 0.08
}
```

### risk-agent（blocking gate）
```json
// 输入
{
  "action": "risk_review",
  "candidate": {...},
  "evaluation": {...}
}
// 输出
{
  "status": "success",
  "result": "pass",           // pass | fail
  "risk_level": "low",        // low | mid | high
  "reason": "通过风险审核",
  "position_hint": 0.3,
  "stop_loss_pct": 0.05
}
```

### fin-commander
```json
// 输出给 commander
{
  "action": "final_approval",
  "market": "美股",
  "signals": [...],
  "risk_results": [...],
  "recommendation": "APPROVE",  // APPROVE | REJECT | ESCALATE
  "summary": "..."
}
```

## 状态流转规则

| 当前状态 | 接收字段 | 目标状态 |
|---------|----------|----------|
| - | current_status=draft | draft |
| draft | backtest_passed | backtested |
| backtested | evaluation.score≥70 | evaluated |
| evaluated | risk.result=pass | approved |
| approved | notified | archived |

## 审计日志格式

每个 agent 输出时同时写入 agent_logs：

```json
{
  "log_id": "log_uuid",
  "run_id": "run_uuid",
  "agent_id": "quant-agent",
  "input_summary": "生成信号: AAPL call 0.75",
  "output_summary": " signals: 3",
  "status": "success",
  "timestamp": "2026-03-29T15:30:00Z"
}
```