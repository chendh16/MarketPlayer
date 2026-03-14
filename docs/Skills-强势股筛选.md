# 持仓复盘 - Skills 定义

## Skill: 资产配置复盘

### 触发指令
- "持仓复盘"
- "帮我做资产配置分析"
- "/position-review"

### 执行流程

#### Step 1: 获取持仓数据
```
工具: fetch_position_review
参数: { broker: "futu" }
返回: 持仓快照 + 风险指标
```

#### Step 2: 获取实时行情 (自动)
```
工具: fetch_batch_quote
参数: { symbols: [...] }
更新持仓实时价格
```

#### Step 3: 计算风险指标 (自动)
```
- 仓位占比
- 行业集中度
- 个股集中度
- 风险评分
```

#### Step 4: 生成报告
```
输出:
## 📊 持仓复盘报告

### 资产概况
- 总资产: xxx
- 持仓市值: xxx
- 可用现金: xxx
- 仓位: xx%

### 持仓明细
| 股票 | 数量 | 成本 | 现价 | 盈亏 | 仓位 |

### 风险指标
- 风险等级: 中
- 行业集中: 食品饮料 50%
- 现金比例: 10%

### ⚠️ 风险提示
- 行业集中度过高
- 建议减仓/分散
```

---

## Skill: 强势股筛选

### 触发指令
- "强势股筛选"
- "帮我选强势股"
- "/strong-stocks"

### 执行流程

#### Step 1: 获取多维度排行
```
工具: fetch_top_gainers   (涨幅榜)
工具: fetch_top_volume    (成交额)
工具: fetch_top_turnover  (换手率)
工具: fetch_industry_board (板块涨跌)
```

#### Step 2: 综合筛选
```
条件:
- 涨幅 > 5%
- 成交额 > 10亿
- 换手率 > 5%
- 热门板块
```

#### Step 3: 获取技术指标 (可选)
```
工具: fetch_technical_indicators
参数: { symbol, period: "1day" }
```

#### Step 4: 生成报告
```
## 🔥 强势股精选

### 今日热点板块
- 电子: +3.21%
- 新能源: +2.85%

### 强势股 TOP 10
...

### 分析解读
```

---

## MCP 工具清单 (Phase 1-3 完成)

### 行情数据
| 工具 | 功能 |
|------|------|
| fetch_realtime_quote | 实时行情 |
| fetch_kline | K线 |
| fetch_batch_quote | 批量行情 |
| search_stock | 搜索 |

### 排行榜
| 工具 | 功能 |
|------|------|
| fetch_top_gainers | 涨幅榜 |
| fetch_top_losers | 跌幅榜 |
| fetch_top_volume | 成交额 |
| fetch_top_turnover | 换手率 |

### 板块
| 工具 | 功能 |
|------|------|
| fetch_industry_board | 行业板块 |
| fetch_concept_board | 概念板块 |
| fetch_region_board | 地域板块 |

### 指标
| 工具 | 功能 |
|------|------|
| fetch_technical_indicators | 技术指标 |

### 持仓
| 工具 | 功能 |
|------|------|
| fetch_position_review | 持仓复盘 |

---

## 排期进度

- [x] Phase 1: 排行榜模块
- [x] Phase 2: 板块 + 技术指标
- [x] Phase 3: 持仓复盘
- [ ] Phase 4: 富途持仓 API 接入 (生产)
- [ ] Phase 5: Skills 封装
