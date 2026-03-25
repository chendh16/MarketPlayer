# 短线Agent 公共配置（可共享版）

> 基于 HEARTBEAT.md 的统一配置

## 📋 参数配置

| 参数 | 值 | 说明 |
|------|-----|------|
| fast_period | 5 | 快速均线周期 |
| slow_period | 10 | 慢速均线周期 |
| rsi_period | 14 | RSI周期 |
| rsi_low | 35 | RSI超卖阈值 |
| rsi_high | 65 | RSI超买阈值 |
| min_score | **70** | 触发买入的最低分数 |
| stop_loss_pct | 0.05 | 止损 5% |
| profit_target_pct | **0.08** | 止盈 8% |
| max_hold_days | **5** | 最大持仓期 |
| early_exit_days | **5** | 提前平仓天数 |
| early_exit_profit_pct | **0.08** | 提前平仓线 8% |

## 📊 监控配置

- **市场**: A股/港股/美股
- **股票池**: 各市场前50只
- **模拟资金**: $100,000

## 🛡️ 风控规则

1. SPY在MA20之下 → 禁止开仓
2. A股在20日均线下方 → 禁止开仓
3. 连续亏损计数、每周回撤监控

## ⚙️ 监控频率

- 信号扫描: 每5分钟一次
- 持仓检查: 每10分钟一次
- 仅在市场开盘时间运行

## 🚀 启动命令

```bash
npm run short-term-monitor start   # 启动
npm run short-term-monitor status  # 状态
npm run short-term-monitor stop    # 停止
```

---

*最后更新: 2026-03-25*