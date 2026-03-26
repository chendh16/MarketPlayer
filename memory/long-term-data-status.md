# 长线Agent 数据源状态

**更新时间**: 2026-03-25

---

## 数据获取状态

### ✅ A股数据 (已获取)

| 股票 | 代码 | PE | PB | ROE | 收盘价 |
|------|------|-----|-----|-----|--------|
| 贵州茅台 | 600519 | 20.5 | 6.87 | 24.64% | ¥1410.27 |
| 五粮液 | 000858 | 13.86 | 2.79 | 15.37% | ¥102.27 |
| 宁德时代 | 300750 | 25.15 | 5.39 | 24.91% | ¥180.27 |
| 中国平安 | 601318 | 6.01 | 1.08 | 13.7% | ¥38.42 |
| 美的集团 | 000333 | 11.26 | 2.61 | 16.79% | ¥56.78 |

### ❌ 港股数据 (Yahoo Finance限流)

尝试获取但失败:
- 00700 腾讯控股
- 09988 阿里巴巴-SW
- 03690 美团-W
- 02318 中国平安

### ❌ 美股数据 (Yahoo Finance限流)

尝试获取但失败:
- AAPL 苹果
- MSFT 微软
- GOOGL 谷歌A
- AMZN 亚马逊
- NVDA 英伟达
- TSLA 特斯拉
- META Meta

---

## 数据文件位置

```
data/fundamental/600519_financial.json
data/fundamental/000858_financial.json
data/fundamental/300750_financial.json
data/fundamental/601318_financial.json
data/fundamental/000333_financial.json
```

---

## 下一步

1. 等待Yahoo Finance限流解除后重试获取港股/美股数据
2. 或使用备用数据源 (Financial Modeling Prep等)
3. 长线Agent可以使用A股数据进行估值分析

---

**状态**: A股数据可用，港股/美股待获取