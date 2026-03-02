搜索网络，分析对冲基金最新季度13F持仓变化，追踪聪明钱的流向。

搜索数据源：
1. WhaleWisdom：whalewisdom.com（13F季报聚合分析）
2. Dataroma：dataroma.com/m/home.php（超级投资者持仓追踪）
3. SEC EDGAR 13F全文：efts.sec.gov/LATEST/search-index?forms=13F-HR
4. 财经媒体关于机构持仓变化的报道

分析对象：前10大对冲基金/价值投资者（含：Berkshire、Bridgewater、Tiger Global、Pershing Square、Lone Pine、D1 Capital、Renaissance、Two Sigma、Citadel、Third Point等知名基金）

对比维度：本季度 vs 上季度

输出格式（分三块）：

**1. 新建仓（本季新增，上季没有）**
| 基金 | 新建仓标的 | 持仓金额 | 占组合% |
|------|-----------|---------|--------|

**2. 完全退出（本季清仓，上季有持仓）**
| 基金 | 清仓标的 | 上季持仓金额 | 退出原因推测 |
|------|---------|------------|------------|

**3. 大幅增仓（增幅>30%）**
| 基金 | 标的 | 增幅 | 当前持仓金额 |
|------|------|------|------------|

**4. 趋势总结**
- 机构共同加仓的行业/主题（3个）
- 机构共同减仓的行业/主题（3个）
- 最值得关注的单一动作（1个）

所有数据附 WhaleWisdom 或 Dataroma 来源链接，注明数据截止日期（13F有45天延迟）。

用法示例：
$ARGUMENTS

请搜索 WhaleWisdom 和 Dataroma，分析最新季度前10大对冲基金的持仓变化，按格式输出。
