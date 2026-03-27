# AI 投资助手竞品分析报告

**生成日期**：2026-03-27

---

## 一、GitHub 热门项目概览

| 项目 | ⭐ Stars | 语言 | 特点 |
|------|----------|------|------|
| **OctoBot** | 5.5k | Python | 加密货比交易机器人，支持AI/Grid/DCA策略，15+交易所 |
| **AI-Scalpel-Trading-Bot** | 425 | Python | 机器学习优化策略的加密交易机器人 |
| **Stock-Market-AI-GUI** | 348 | Python | 股票市场预测+AI交易GUI |
| **kalshi-ai-trading-bot** | 293 | Python | 预测市场AI交易系统，多模型决策ensemble |
| **crypto-trading-ai-bot-basic** | 304 | Python | 基础加密AI交易机器人 |
| **InvestAI** | 152 | Python | 趋势监控、规则触发、风险信号 |
| **polymarket-ai-trading-bot** | 38 | TypeScript | Polymarket预测市场AI机器人 |

---

## 二、核心特性分析

### 1. 多模型 Ensemble 决策
- **kalshi-ai-trading-bot**：5个前沿LLM（Grok-3, Claude, GPT-4o, Gemini, DeepSeek）协作，每个模型扮演不同角色（预测者/多头/空头/风控/新闻分析）
- 共识门控：置信度低于阈值时跳过交易
- 加权投票机制决定最终决策

### 2. 量化策略支持
- **OctoBot**：Grid策略、DCA策略、TradingView策略、技术指标（RSI, MACD, MA）
- 支持15+交易所（Binance, Coinbase, Hyperliquid, Bybit等）
- 内置回测引擎

### 3. 风控机制
- **kalshi-ai-trading-bot**：
  - Kelly Criterion仓位管理（0.75x Fractional Kelly）
  - 每日15%止损、50%最大回撤熔断
  - 日API成本预算（默认$10/天）
  - 行业集中度限制（单类别≤90%）
- **OctoBot**：支持纸交易模式模拟

### 4. 数据源与接口
- 实时市场数据（REST API + WebSocket）
- 社交情绪分析（Google Trends, Reddit）
- RSS新闻源
- 预测市场API（Kalshi, Polymarket）

### 5. 用户界面
- **OctoBot**：Web界面 + Telegram机器人 + 移动端App
- **kalshi-ai-trading-bot**：Streamlit实时仪表盘
- SQLite本地 telemetry

---

## 三、新兴趋势

1. **预测市场（Prediction Markets）**
   - Kalshi、Polymarket 等预测市场成为AI交易新场景
   - 事件驱动型交易（CPI、Fed决策、体育赛事）

2. **多模型协作架构**
   - 单一模型 → 多模型Ensemble辩论机制
   - 角色专业化（风控、新闻分析、趋势预测分工）

3. **严格风控默认开启**
   - 从亏损经验中学习，纪律模式成为标配
   - 分类评分、组合强制、保守参数

4. **LLM成本控制**
   - 日预算限制避免API成本失控
   - 决策置信度过滤减少无效调用

---

## 四、对 MarketPlayer 的启示

- 考虑引入多模型Ensemble决策机制提升准确性
- 加强风控模块（Kelly Criterion、止损、回撤熔断）
- 探索预测市场数据源（Kalshi、Polymarket）
- 丰富数据源：技术指标 + 社交情绪 + 新闻
- 纸交易/回测功能是用户刚需

---

*数据来源：GitHub 搜索结果 (2026-03-27)*