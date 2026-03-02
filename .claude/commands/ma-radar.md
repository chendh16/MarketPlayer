搜索网络，扫描潜在并购目标，寻找被收购概率高或已有传言的公司。

搜索数据源：
1. 财经媒体：Bloomberg、Reuters、WSJ、Financial Times 并购相关报道
2. SEC 13D/13G filings（激进股东持仓）：efts.sec.gov/LATEST/search-index?forms=SC 13D,SC 13G
3. 行业整合新闻（近3个月内"acquisition"、"merger"、"buyout"、"takeover"关键词）
4. 私募/战略并购传言专栏：Dealbreaker、PE Hub

识别特征（满足2项以上优先）：
- 行业整合趋势中的小市值公司
- 估值明显低于同行（EV/EBITDA 或 P/S 折价）
- 出现激进股东（13D持仓>5%）
- 近期出现不寻常期权成交量
- 管理层近期公开表示"开放战略选项"

目标数量：找出5家

每家输出格式：
| 字段 | 内容 |
|------|------|
| 股票代码 | XXXX |
| 可能收购方 | 具体公司名称或"同行战略买家"/"PE" |
| 行业历史并购溢价 | XX%（近3年同类交易均值） |
| 当前信号 | 激进股东/传言/期权异动等 |
| 监管风险 | 反垄断/外资审查等 |
| 来源链接 | [来源1](URL) [来源2](URL) |

用法示例：
$ARGUMENTS

请搜索财经媒体和 SEC filings，找出5家并购概率较高的公司，按格式输出。
