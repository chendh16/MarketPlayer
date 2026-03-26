# MEMORY.md - 长期记忆

## Agent 团队架构 (2026-03-09)

```
用户
└── commander（总指挥）
    ├── dev-commander（开发团队负责人）
    │   ├── app-agent（产品研究）
    │   ├── pm-agent（任务排期）
    │   ├── dev-agent（开发）
    │   ├── test-agent（测试）
    │   └── ops-agent（运维）
    └── fin-commander（金融团队负责人）
        ├── data-agent（数据）
        ├── quant-agent（量化）
        ├── value-agent（价值）
        ├── backtest-agent（回测）
        ├── market-agent（市场）
        └── risk-agent（风控）
```

## 重要规则 (2026-03-17)

### ⚠️ 每天必须检查运营状态

1. **新闻分析** - 必须推送给用户
2. **实盘分析** - 必须推送给用户
3. **日报任务** - 每天 09:00 和 16:00 必须发送
4. **服务运行状态** - 确保系统正常运行

**这是硬性要求，任何分析报告必须主动推送给用户，不能等待用户询问。**

### 推送规则 (2026-03-22)

- **双通道推送**: 所有重要通知必须同时推送到 **飞书** 和 **微信**
- 包括：金融汇报、风险预警、交易信号、代码验证结果等

---

## 项目

- **MarketPlayer**: AI Trading Assistant for Chinese Investors
- 位于: `/workspace/`

---

## 新需求 (2026-03-18)

### 模拟盘交易功能

1. **富途美股模拟盘** - 已配置完成 (acc_index=0)
2. **飞书通知** - 金融团队下单时需要通过飞书通知用户确认
3. **数据展示** - 需要看到所有数据（短线+长线的模拟持仓）
4. **反馈机制** - 金融团队无法下单或需要量化开发的需求，反馈给开发团队

## 短线策略参数 (2026-03-24) - 最终优化版本

**均线 + RSI + ATR 短线策略（已优化）**

| 参数 | 值 | 说明 |
|------|-----|------|
| fast_period | 11 | 快速均线周期 |
| slow_period | 30 | 慢速均线周期 |
| rsi_period | 14 | RSI计算周期 |
| rsi_low | 35 | RSI超卖阈值 |
| rsi_high | 65 | RSI超买阈值 |
| atr_multiplier | 1.5 | ATR止损乘数 |
| min_score | 65 | 最小信号得分 |
| stop_loss_pct | 2.0倍ATR (上限6%) | 动态止损 |
| profit_target_pct | 12% | 止盈线 |
| max_hold_days | 10 | 最大持股天数 |
| 持仓第5天规则 | 盈利<8%提前平仓 | 减少回撤 |

### 优化过程记录
- 初始回撤: 29%
- 止损优化后: 19.7%
- 持仓退出优化后: 16.7%
- 最终回撤: ~16.7%

### 性能指标 (趋势上涨段)
- Sharpe: 2.32
- 收益率: ~48%
- 胜率: ~43%
- 交易次数: ~51笔

### 数据配置
- 股票池: AAPL, MSFT, TSLA, NVDA, AMZN, GOOGL, META
- 大盘基准: SPY
- 数据范围: 2014-04 至 2026-03 (约12年)

---

## 数据存储位置 (2026-03-23)

### 美股3年历史数据
- **位置**: `/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines/`
- **格式**: `us_{SYMBOL}.json` (包含 klines 数组)
- **时间范围**: 2014-04-16 至 2026-03-20 (约12年)
- **已获取股票**: 89只美股
- **每只股票数据量**: 1300-3000条

---

## 长线Agent数据源 (2026-03-25)

### 数据获取状态

**A股**: ✅ 已完成
- 600519 贵州茅台: PE=20.5, PB=6.87, ROE=24.64%
- 000858 五粮液: PE=13.86, PB=2.79, ROE=15.37%
- 300750 宁德时代: PE=25.15, PB=5.39, ROE=24.91%
- 601318 中国平安: PE=6.01, PB=1.08, ROE=13.7%
- 000333 美的集团: PE=11.26, PB=2.61, ROE=16.79%

**港股**: ❌ Yahoo Finance限流 (待重试)
**美股**: ❌ Yahoo Finance限流 (待重试)

### 数据文件
```
data/fundamental/{code}_financial.json
```

### data_sources 标志 (长线Agent启动开关)
```json
{
  "cn_financial": true,
  "hk_financial": false,
  "us_financial": false,
  "industry_valuation": false,
  "last_data_update": "2026-03-25"
}
```

---

持续更新中...
