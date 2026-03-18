# 每日竞品分析报告 - AI 投资助手 (2026-03-18)

## 一、概述

今日 GitHub 搜索发现 **25+** 个 AI 投资/交易相关开源项目，以下是值得关注的新兴竞品分析。

---

## 二、重点竞品详情

### 1. AlgoStockGPT-AI (30 ⭐)
**技术栈**: Next.js 15 + TypeScript + GPT-4 + TailwindCSS

**核心功能**:
- 🤖 GPT-4 驱动的自然语言股票分析
- 📊 实时市场数据与经济指标 (GDP、失业率、通胀)
- 📈 K线图 + 多时间框架分析 (1秒-1周)
- 🏭 行业板块分析
- 📰 新闻情绪分析集成
- 💬 对话式投资建议界面
- 🌙 深色/浅色主题切换

**特色**: 对话式交互 + 专业图表结合，定位个人 AI 金融分析师

---

### 2. ai-stock-analyst (1 ⭐)
**技术栈**: Python + Streamlit + 多 LLM 支持

**核心功能**:
- 🧠 **多 Agent 架构** (6个专业 Agent):
  - 估值 Agent → 计算内在价值
  - 情绪 Agent → 市场情绪分析
  - 基本面 Agent → 财务数据分析
  - 技术分析 Agent → 技术指标评估
  - 风控 Agent → 风险计算 + 仓位限制
  - 投组 Agent → 最终交易决策
- 🔄 支持 OpenAI / Anthropic / Google AI / Ollama
- 📉 回测引擎 + Walk-Forward 分析
- 🧪 GPU 加速 ML 集成模型

**特色**: 多 Agent 协作决策流程，机构级风控

---

### 3. AI-Powered-TradingBot (2 ⭐)
**技术栈**: Python + Streamlit + TensorFlow/Keras (LSTM)

**核心功能**:
- 🖥️ 交互式仪表盘
- 👤 用户认证系统
- 📊 虚拟组合管理 (股票 + 加密货币)
- ⚠️ 实时风险评分 (0-100)
- 🔔 浏览器推送 + 声音告警
- 📈 技术分析 (K线/SMA/RSI/MACD)
- 🤖 LSTM 价格预测模型

**特色**: LSTM 深度学习预测 + 实时告警

---

### 4. ai-etf-signals (1 ⭐)
**技术栈**: Python

**核心功能**:
- 🏦 ETF 交易信号生成
- 🔍 **多 LLM 验证机制** (3-Step Strategy)
- 📊 实时市场分析
- ⚖️ 投资组合优化
- 🇨🇳 中文界面支持

**特色**: ETF 细分市场 + 多模型验证

---

### 5. turtlestack-lite (4 ⭐)
**技术栈**: JavaScript + MCP (Model Context Protocol)

**核心功能**:
- 🇨🇳 **印度股票经纪商集成** (Kite/Zerodha, Groww, Dhan, AngelOne)
- 🔗 通过 Claude AI 统一访问
- 📈 技术分析支持

**特色**: 专注印度市场的 MCP 服务器

---

## 三、新兴技术趋势

| 趋势 | 项目示例 | 说明 |
|------|---------|------|
| **多 Agent 架构** | ai-stock-analyst | 6个专业 Agent 协作决策 |
| **多 LLM 支持** | ai-stock-analyst, ai-etf-signals | OpenAI/Anthropic/Google/Ollama |
| **深度学习预测** | AI-Powered-TradingBot | LSTM 神经网络价格预测 |
| **实时告警** | AI-Powered-TradingBot | 浏览器推送 + 声音 |
| **回测引擎** | ai-stock-analyst | 事件驱动回测 + Walk-Forward |
| **MCP 协议** | turtlestack-lite | Model Context Protocol 集成 |
| **对话式 UI** | AlgoStockGPT-AI | 自然语言查询 + 专业图表 |

---

## 四、对 MarketPlayer 的建议

1. **多 Agent 架构** 可参考 ai-stock-analyst 的 6 Agent 设计
2. **多 LLM 支持** 已成为标配，建议支持 Ollama 本地部署
3. **ETF/组合信号** 是细分蓝海，ai-etf-signals 模式可借鉴
4. **实时告警** 是用户痛点，AI-Powered-TradingBot 的推送方案值得参考
5. **中文本地化** 仍有市场需求

---

*报告生成时间: 2026-03-18 20:47*
