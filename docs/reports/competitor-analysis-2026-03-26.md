# 每日竞品分析报告 - 2026年3月26日

## AI 投资助手竞品 GitHub 调研

### 一、热门项目概览

| 项目 | ⭐ Stars | 描述 | 技术栈 |
|------|---------|------|--------|
| **pybroker** | 3,245 | Python 算法交易框架，支持机器学习 | Python, NumPy, Numba |
| **surpriver** | - | 股票异常检测，发现大波动股票 | Python, ML |
| **LLM-Stock-Manager** | 8 | 多代理回测框架（情感+基本面+估值代理） | Python |
| **ai-portfolio-manager** | - | 5个GPT-4代理自动股票交易 | Python, GPT-4, Alpaca |

### 二、核心特性分析

#### 1. pybroker (⭐3,245) - 最热门
- **快速回测引擎**: 基于 NumPy + Numba 加速
- **数据源**: 支持 Alpaca、Yahoo Finance、AKShare
- **Walkforward Analysis**: 模拟真实交易场景
- **Bootstrap 指标**: 更可靠的随机化统计
- **缓存 & 并行计算**: 加速开发

#### 2. LLM-Stock-Manager - 多代理架构
- **Sentiment Agent**: 情感分析
- **Fundamental Agent**: 基本面分析
- **Valuation Agent**: 估值分析
- **Reasoning Agent**: 决策制定
- **Portfolio Manager**: 仓位管理

#### 3. ai-portfolio-manager
- **5个专门GPT-4代理**
- **Alpaca集成**: 直接执行交易

### 三、新兴特性与趋势

1. **LLM/多代理架构** - 使用大语言模型进行投资决策
2. **Walkforward Analysis** - 更真实的回测方法
3. **Bootstrap统计** - 更可靠的风险指标
4. **实时数据整合** - Alpaca等API直接交易
5. **多数据源支持** - Yahoo Finance, AKShare, 自定义数据

### 四、对 MarketPlayer 的启示

1. 考虑集成 **LLM 代理** 进行市场分析和决策
2. 加强 **回测能力** - Walkforward Analysis + Bootstrap
3. 支持更多 **数据源** (AKShare 适合A股)
4. 考虑 **Alpaca** 等海外券商API集成
5. 添加 **缓存机制** 提升性能

---
*数据来源: GitHub 搜索 "AI investment assistant OR AI trading bot OR quantitative trading"*