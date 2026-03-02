搜索网络，检测近期重大内部人士买入行为，识别高管对自家公司的信心信号。

搜索数据源：
1. OpenInsider：openinsider.com/screener（筛选：Buy / 近30天 / 金额>$10万）
2. SEC Form 4 全文检索：efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom
3. 近期财经新闻中关于内部人买入的报道

筛选条件：
- 交易类型：买入（非期权行权）
- 时间范围：过去30天
- 金额下限：$100,000（10万美元）
- 优先选择：CEO/CFO/COB职位买入 > 董事 > 高管
- 排除：自动计划购买（Rule 10b5-1 计划内的小额定期购买）

目标数量：找出6支最值得关注的股票

每支输出格式：
| 字段 | 内容 |
|------|------|
| 股票代码 | XXXX |
| 内部人士职位 | CEO / CFO / COB / Director 等 |
| 买入金额 | $XXX,XXX |
| 买入价 vs 当前价 | $XX → $XX（+X%/-X%） |
| 内部人可能掌握的信息 | 结合公司近期公告/业务分析推断 |
| 来源链接 | [OpenInsider](URL) / [SEC](URL) |

最终附：简短的整体解读（哪些行业集中出现内部人买入？有无共同主题？）

用法示例：
$ARGUMENTS

请搜索 OpenInsider 和 SEC Form 4，找出过去30天最重要的内部人买入，按格式输出6支股票。
