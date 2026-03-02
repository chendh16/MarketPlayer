每周一执行：结合当前资讯、持仓状态和宏观数据，生成一页量化投资周报。

执行步骤：

**Step 1：获取本周资讯**

```
POST http://localhost:{MCP_SERVER_PORT}/tools/fetch_news
{"market": "us"}
```
```
POST http://localhost:{MCP_SERVER_PORT}/tools/fetch_news
{"market": "hk"}
```

**Step 2：获取当前持仓（如提供 userId）**

```
POST http://localhost:{MCP_SERVER_PORT}/tools/get_positions
{"userId": "<userId>", "broker": "longbridge"}
```

**Step 3：搜索本周宏观事件和市场数据**

搜索以下内容（使用最新日期）：
- 本周重要宏观事件日历：Investing.com 经济日历
- 本周财报日历：Earnings Whispers（earningswhispers.com）或 Seeking Alpha 财报日历
- 上周行业资金流：ETF.com / EPFR 资金流数据 / FactSet 行业资金流
- 主要指数周涨跌和技术位

**Step 4：生成一页执行总结**

---

# 量化周报 — [本周日期]

## 宏观要事（Top 3）
1. [事件] — [影响分析]（来源：[链接]）
2. [事件] — [影响分析]（来源：[链接]）
3. [事件] — [影响分析]（来源：[链接]）

## 本周财报重点
| 公司 | 报告日期 | 市场预期 EPS | 关注点 |
|------|---------|------------|------|

## 行业资金流向
- 流入最多：[行业] +$XXX亿（来源：[链接]）
- 流出最多：[行业] -$XXX亿
- 第三名：[行业]

## 本周交易想法
**多头机会**：[标的] — [逻辑] — 入场价：$XX，止损：$XX，目标：$XX
**空头机会**：[标的] — [逻辑] — 入场价：$XX，止损：$XX，目标：$XX

## 本周需警戒的风险
1. [风险事件1]
2. [风险事件2]
3. [风险事件3]

---

触发方式：每周一（市场开盘前）执行

用法示例：
$ARGUMENTS

请先调用 fetch_news 获取本周资讯，再搜索宏观日历和财报日历，生成完整一页量化周报。
