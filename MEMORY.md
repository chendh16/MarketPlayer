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

## 富途模拟盘对接 (2026-04-02)

### 已完成
- evaluator-agent/run.js 新增 placeFutuOrderPython()
  用 spawn python3 调用 FutuAPI 自动下单
- 信号 verdict=candidate_paper 或 candidate_live 时自动触发
- 下单固定参数：trd_env=SIMULATE, qty=100股

### 关键配置
- FUTU_ORDER_MODE=PYTHON（.env）
- FUTU_TRD_ENV=SIMULATE（.env）
- OpenD 地址：127.0.0.1:11111
- 账户配置见 .env 文件

### 新增 API 路由
- GET /api/futu/positions → 实时查询模拟盘持仓
- GET /api/futu/orders → 查询最近20笔订单

### 前端
- public/panel-orders.html 顶部新增「富途模拟盘持仓」区块
- 30秒自动刷新
- 访问：http://localhost:3000/panel-orders.html

### 测试成功的订单
- 2026-04-01 AAPL 100股 order_id=6772201 (FILLED_ALL)

### 已知问题
- panel-orders.html 订单列表 HTTP 401（认证问题，待处理）
- 手机富途 App 模拟盘不同步（OpenD模拟盘与App融资融券模拟账户是两套系统）
- A股下单暂未实现

#
## 学习闭环更新 (2026-04-02)

### 评估统计
- 评估次数: 6
- 平均分数: 25.0
- 平均Sharpe: -9.11
- 趋势: stable

### 新 hypothesis
- RSI极值+短周期MA (confidence: 0.6)
- 放宽RSI+标准MA (confidence: 0.6)
- RSI中性+长周期MA (confidence: 0.6)

### 探索方向
无



## 学习闭环更新 (2026-04-02)

### 评估统计
- 评估次数: 9
- 平均分数: 28.3
- 平均Sharpe: -6.07
- 趋势: improving

### 新 hypothesis
- 保持当前参数，继续观察 (confidence: 0.5)

### 探索方向
25_5_15, 35_10_30, 40_20_50



## 学习闭环更新 (2026-04-02)

### 评估统计
- 评估次数: 9
- 平均分数: 28.3
- 平均Sharpe: -6.07
- 趋势: improving

### 新 hypothesis
- 保持当前参数，继续观察 (confidence: 0.5)

### 探索方向
30_5_20, 25_5_15, 35_10_30, 40_20_50


## 下次对话优先级
1. 修复订单列表 401 认证
2. 考虑 ngrok 内网穿透，手机访问 dashboard

---

## 架构重构 (2026-04-03)

### 回测架构拆分（两层分离）

之前：backtest-agent 混用信号验证和策略评估，导致数据无意义
现在：
- **层1 signal-validator**：从 signal.timestamp 开始，验证单个信号是否值得下单
- **层2 strategy-backtester**：用2年历史数据跑参数组合，输出策略级指标（win_rate, sharpe）

### 新增大盘趋势过滤器

位置：quant-agent 入口
数据源：data/cache/klines/us_SPY.json

过滤逻辑：
- **risk_on**：SPY 在 MA50 以上，正常交易
- **caution**：SPY 在 MA50 以下但20天跌幅 < 8%，提高信号阈值到 0.4
- **risk_off**：SPY 20天跌幅 > 8%，暂停所有信号

当前状态：**caution**（SPY=655.84, MA50=683.22, 20d=-3.9%）

### 学习闭环修复

之前：数据库0字节，学习从未发生
现在：
- WAL模式解决DB锁冲突
- 触发链路：daily-trigger → quant → strategy-backtester → evaluator → learning-agent
- learning-agent 读取历史 versions 和 actions，累积学习
- learning_actions 表已有3条记录

### 策略当前状态

strategy-backtester 验证结果（2024-2026，18笔交易）：
- **整体胜率**：55.6%
- **Sharpe**：2.57
- **最大回撤**：19.2%
- **2025年分段胜率**：64%（主要贡献）
- **2026年Q1**：caution过滤后，预期改善

### 行业黑名单

已实现：NVDA, AMD, INTC, TSM, AVGO, TXN, QCOM, MU, AMAT, LRCX, KLAC, MRVL 等半导体已过滤

### 已知局限

- MSFT 2026-01-02 亏损无法过滤（当时是 risk_on，属于正常损耗）
- AAPL 2026-02-27 亏损会被 caution 模式过滤
- 数据截止：2026-03-20，需要定期更新

### 当前策略版本

- 版本：v1.0.1-filtered
- 状态：candidate_paper
- 参数：rsi_oversold=40, ma_short=5, ma_long=20

---

## 通知系统配置 (2026-04-03)

### crontab 时间表（北京时间）

| 时间 | 市场 | 类型 |
|------|------|------|
| */5 * * * * | 全部 | 高频扫描（每5分钟） |
| 15 9 * * 1-5 | A股+港股 | 开盘前 |
| 5 15 * * 1-5 | A股 | 收盘后 |
| 5 16 * * 1-5 | 港股 | 收盘后 |
| 15 21 * * 1-5 | 美股 | 开盘前（夏令时） |
| 15 5 * * 2-6 | 美股 | 收盘后（次日） |
| 0 20 * * 0 | 全部 | 每周学习总结 |
| 0 2 * * 6 | 全部 | 周策略复盘 |
| 0 9 1 * * | 全部 | 月度估值报告 |

**共11条定时任务，已全部验证存在**

**夏令时说明**：
- 夏令时（现在）：美股 21:30 开盘 → 用 21:15/05:15
- 冬令时：美股 22:30 开盘 → 改为 22:15/06:15

### 4种学习通知

1. **hypothesis 生成时** → 立即推送（strategy-learning-agent）✅
2. **hypothesis 验证结果** → 立即推送（strategy-backtester）✅
3. **策略版本升级** → 立即推送（evaluator-agent）待补充
4. **每周学习总结** → 每周日20:00（weekly-summary.js）✅

### 执行日志

- **位置**：`logs/cron.log`
- **格式**：`{timestamp} {script} {args} executed`
- **用途**：确认 crontab 是否真实触发
- **飞书验证**：2026-04-03 已收到 daily-trigger + weekly-summary 两条消息

### 明日启动时检查

```bash
tail -20 logs/cron.log
```

确认今晚 21:15 的美股开盘前通知是否触发。

### 飞书通知模板

- 开盘前：大盘状态 + 信号列表 + 需要确认
- 收盘后：持仓 + 系统运行统计 + 策略状态
- 即时通知：新信号 / 风险预警 / 学习更新

---

## 下次对话启动检查清单

1. 读取 PROJECT.md + MEMORY.md
2. `tail logs/cron.log` 确认定时任务在跑
3. 查看 market_status（当前 caution）
4. 报告最新 backtest_runs 的 win_rate 和 Sharpe
5. 如有新 learning_actions，汇报 hypothesis 内容
6. 距离模拟盘到期（2026-04-26）还有多少天

---

## 长线策略数据源 (2026-04-03)

### 数据源
SEC EDGAR（官方财报，完全免费）
User-Agent: MarketPlayer admin@marketplayer.com
请求间隔：1秒/次

### CIK 对照表
| 股票 | CIK |
|------|-----|
| AAPL | 0000320193 |
| MSFT | 0000789019 |
| GOOGL | 0001652044 |
| AMZN | 0001018724 |
| META | 0001326801 |
| TSLA | 0001318605 |
| NVDA | 0001045810 |

### 数据路径
- 原始数据：`data/sec/{symbol}_raw.json`
- 标准化：`data/fundamental/{symbol}_fundamental.json`

### 关键字段解析
- 净利润：`facts.us-gaap.NetIncomeLoss`（取最近4季度年化）
- 股东权益：`facts.us-gaap.StockholdersEquity`
- 自由现金流：经营现金流 - 资本支出
- PE：最新收盘价 / EPS（EPS = 年度净利润 / 稀释股数）
- ROE：净利润 / 股东权益

### PE/ROE 数据（2026-04-03）
| 股票 | PE | ROE | 备注 |
|------|-----|-----|------|
| AAPL | 38.4 | 254.1% | ROE虚高（权益低） |
| MSFT | 31.4 | 55.6% | |
| GOOGL | 16.6 | 64.7% | |
| AMZN | 30.2 | 64.0% | |
| META | 25.7 | 60.2% | |
| TSLA | 117.7 | 12.1% | 高PE |
| NVDA | 7.2 | 122.0% | 低PE |

### 已知数据问题
- AAPL ROE=254%：技术上正确，但因股东权益极低导致虚高
  → 长线筛选时 ROE 上限设为 100%
- NVDA PE=7.2：可能因SEC数据异常，使用了估算净利润

### 更新频率
每季度财报后更新一次
crontab：每月1日 09:00（已配置）

### 放弃的数据源
- Yahoo Finance：限流
- Alpha Vantage：25次/天不够用
- Financial Modeling Prep：需要注册
- **SEC EDGAR**：✅ 选定方案
