结合当前持仓数据，设计针对性的组合对冲策略，降低特定风险敞口。

执行步骤：

**Step 1：获取当前持仓**

调用 MCP 工具：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/get_positions
{"userId": "<userId>", "broker": "longbridge"}
```

**Step 2：执行风控评估**

调用 MCP 工具确认当前风险等级：
```
POST http://localhost:{MCP_SERVER_PORT}/tools/check_risk
{"userId": "<userId>", "symbol": "<最大持仓>", "market": "<市场>", "direction": "long", "positionPct": <当前仓位%>}
```

**Step 3：分析持仓敞口**

根据 Step 1 的持仓数据，判断：
- 主要行业/市场集中度（港股/美股/A股/BTC各占比）
- 最大单一持仓风险
- 是否存在相关性集中（如都是科技股）

**Step 4：搜索对冲工具**

根据敞口方向，搜索以下数据：
- 反向ETF：ProShares、Direxion（美股反向）/ 港股反向产品
- 期权数据：当前VIX水平（cboe.com/vix）/ 主要持仓的Put期权成本
- 数据源：ETF.com、Options Profit Calculator、MarketWatch

**Step 5：输出对冲方案**

| 字段 | 内容 |
|------|------|
| 当前主要风险敞口 | 行业/地区集中度描述 |
| 推荐对冲工具 | 具体ETF代码或期权策略 |
| 建议对冲规模 | 占组合 X-X%（保守/标准/积极） |
| 年化对冲成本 | ~X%（ETF费率+摩擦成本 或 期权时间价值） |
| 触发场景 | 什么情况下对冲会启动保护 |
| 波动率参考数据 | 当前VIX / 隐含波动率 + 来源 |

用法示例：
$ARGUMENTS

请先调用 get_positions 和 check_risk 获取持仓状态，再搜索对冲工具，设计完整对冲方案。
