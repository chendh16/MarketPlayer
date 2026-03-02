搜索网络，筛选高空头仓位且具备挤压潜力的股票，寻找空头挤压交易机会。

搜索数据源：
1. Finviz 筛选器：finviz.com/screener.ashx?v=111&f=sh_short_o20（空头比>20%）
2. Shortquote：shortquote.com（空头比、借入成本、利用率）
3. MarketBeat：marketbeat.com/stocks/short-interest（各股空头数据）
4. 近期新闻中的催化剂报道

筛选条件：
- 空头占流通股比例 > 20%
- 借入成本（borrow rate）偏高或利用率 > 80%
- 近期有明确催化剂（财报、FDA审批、监管结果、产品发布等）

目标数量：找出5支最具挤压潜力的股票

每支输出格式：
| 字段 | 内容 |
|------|------|
| 股票代码 | XXXX |
| 空头占比 | XX.X% of float |
| 平仓天数（Days to Cover） | X天 |
| 借入成本 / 利用率 | XX% / XX% |
| 近期催化剂 | 具体事件 + 日期 |
| 入场策略 | 建议入场区间和方式 |
| 挤压失败风险 | 主要下行风险 |
| 来源 | [Finviz](URL) / [Shortquote](URL) |

用法示例：
$ARGUMENTS

请搜索 Finviz、Shortquote，筛选出5支空头挤压潜力最强的股票，按格式输出。
