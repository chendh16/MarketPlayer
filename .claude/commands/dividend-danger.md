搜索网络，扫描高股息率但存在降息风险的"分红陷阱"，保护组合免受股息削减冲击。

搜索数据源：
1. Seeking Alpha：seekingalpha.com（Dividend Safety Score / 分析师评级）
2. Dividend.com：dividend.com/dividend-stocks（高收益率筛选）
3. Macrotrends：macrotrends.net（各股自由现金流、派息率历史）
4. 财报摘要和近期评论中关于分红可持续性的讨论

筛选条件（满足以下其中一项以上即列入危险名单）：
- 股息收益率 > 5%
- 派息率（Payout Ratio）> 80%，或超过100%（用债务付息）
- 自由现金流（FCF）为负或持续下滑
- 总债务/EBITDA > 4x 且在持续增加
- 股息在过去5年中已有削减记录

目标数量：找出5家分红危险公司

每家输出格式：
| 字段 | 内容 |
|------|------|
| 股票代码 | XXXX |
| 当前股息收益率 | X.X% |
| 派息率 | XX%（或"超过FCF"） |
| FCF趋势 | 过去3年FCF数值 |
| 债务状况 | D/EBITDA 倍数 |
| 降息概率评估 | 高/中/低 + 理由 |
| 更安全的同行替代品 | [代码]（收益率X%，派息率X%） |
| 来源 | [Seeking Alpha](URL) / [Macrotrends](URL) |

最终附：2-3句总结（哪些行业高股息陷阱最集中）

用法示例：
$ARGUMENTS

请搜索 Seeking Alpha、Dividend.com，找出5家高股息但有降息风险的公司，按格式输出。
