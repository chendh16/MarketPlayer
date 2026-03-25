# 长线Agent数据源扩展需求

**优先级**: 高  
**负责人**: 开发团队  
**状态**: 待开发

---

## 背景

长线投资Agent当前数据不足，只有A股大盘PB指数和少量个股基本信息，无法支撑多类型股票的差异化估值评分。需要扩展三个市场的个股财务数据。

---

## 需要开发的内容

### 一、数据获取模块

#### A股数据（AKShare）
```
pip install akshare
```

获取字段：
- PE（市盈率）
- PB（市净率）
- ROE（净资产收益率）
- 净利润增速（近3年）
- 营收增速（近3年）
- 股息率
- 派息率

覆盖股票：600519、000858、300750、601318、000333

#### 港股数据（Yahoo Finance）
```
pip install yfinance
```

覆盖股票：00700、09988、03690、01211、02318

#### 美股数据（Yahoo Finance）

覆盖股票：AAPL、MSFT、GOOGL、AMZN、NVDA、TSLA、META

---

### 二、数据存储格式

路径：`data/fundamental/{代码}_financial.json`

```json
{
  "code": "600519",
  "name": "贵州茅台",
  "market": "CN",
  "last_updated": "YYYY-MM-DD",
  "valuation": {
    "pe": null,
    "pb": null,
    "ps": null
  },
  "profitability": {
    "roe": null,
    "gross_margin": null,
    "net_profit_growth_3y": null,
    "revenue_growth_3y": null
  },
  "dividend": {
    "yield": null,
    "payout_ratio": null,
    "consecutive_years": null
  },
  "growth": {
    "rd_ratio": null,
    "revenue_cagr_3y": null
  }
}
```

---

### 三、数据更新机制

- **更新频率**: 每个交易日收盘后批量更新一次
- **更新时间**: A股15:30后, 港股16:30后, 美股次日04:30后
- **失败处理**: 记录到 `data/logs/fetch_errors.log`

---

### 四、验收标准

| 市场 | 测试标的 | 必含字段 |
|------|----------|----------|
| A股 | 600519贵州茅台 | PE, PB, ROE, 股息率 |
| 港股 | 00700腾讯 | PE, PB, ROE, 股息率 |
| 美股 | NVDA | PE, PS, 营收增速, 毛利率 |

---

## 完成后标志

在 `memory/long-term-sim.json` 中更新：
```json
"data_sources": {
  "cn_financial": true,
  "hk_financial": true,
  "us_financial": true,
  "industry_valuation": false,
  "last_data_update": "YYYY-MM-DD"
}
```

---

**创建时间**: 2026-03-25