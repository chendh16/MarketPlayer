通过结合现有资讯分析工具 + 搜索基本面数据，寻找情绪负面但基本面坚实的套利机会。

执行步骤：

**Step 1：获取近期负面情绪资讯**

调用 MCP 工具获取美股/港股近期资讯：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/fetch_news
{"market": "us"}
```
重复调用 `fetch_news` 获取 hk 市场资讯。

**Step 2：对负面情绪资讯执行分析**

对每条感兴趣的资讯调用：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/analyze_news
{"newsItemId": "<id>"}
```
筛选出 sentiment=negative 且 importance=high/medium 的资讯。

**Step 3：搜索对应公司基本面**

对上述负面情绪公司，搜索以下数据：
- 最新季报：营收/利润/现金流趋势
- 资产负债：债务水平、现金储备
- 行业地位：市场份额、竞争优势
- 数据源：Macrotrends(macrotrends.net)、简单估值模型、财报摘要

**Step 4：识别分歧**

判断逻辑：负面情绪是否反映了暂时性/非结构性因素（如管理层言论、短期利空消息），
而基本面（收入增长、现金流健康）是否与叙述矛盾。

目标数量：找出6个分歧最明显的投资想法

每个输出格式：
| 字段 | 内容 |
|------|------|
| 股票代码 | XXXX |
| 负面情绪来源 | 新闻摘要 + newsItemId |
| 基本面为何矛盾该叙述 | 具体数据支撑 |
| 技术面入场点 | 支撑位/均线区间建议 |
| 风险提示 | 情绪可能持续恶化的条件 |
| 来源 | 资讯链接 + 财务数据来源 |

用法示例：
$ARGUMENTS

请先调用 fetch_news + analyze_news，再搜索基本面数据，找出6个情绪vs基本面分歧最大的机会。
