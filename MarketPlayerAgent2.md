
---



---

## 一、总体定位

系统从原来的**逻辑分组 + 人工 orchestrator**，升级为：

**执行闭环 + 自驱动迭代 + 异常上收治理 + 可审计运行**

你的角色从"日常传话和手动调度"转为**只处理异常、冲突和高风险审批的最终决策者**。

系统目标是让系统能够基于统一协议、明确状态、可追溯记忆和自动触发机制，自主完成：

**情报采集 → 研究建模 → 验证评估 → 风控审核 → 调度输出 → 学习迭代**

commander 只在异常和高风险场景中介入。

---

## 二、整体结构

```
用户
└── commander（异常处理 / 高风险审批 / override，所有override记录到memory-store）
    ├── dev-commander
    ├── fin-commander
    ├── strategy-learning-agent   # 跨团队共享，策略演化专职
    └── Harness Engine

memory-store（独立状态层，不挂任何commander，全局共享访问）
```

### commander

不参与日常传话和低风险调度，只处理异常、冲突、高风险审批，必要时执行override，所有override必须写入memory-store。

### dev-commander

管理开发团队工作流，接收commander的开发侧目标，调度开发层agent执行，处理开发侧异常与交付协调。

### fin-commander

汇总金融团队各层结果，做结论冲突仲裁，输出最终可执行指令，只向commander上报异常与高风险事项。

### strategy-learning-agent

从开发团队独立，挂在commander下，专职承担策略侧学习：提出新hypothesis、生成参数优化建议、驱动下一轮backtest、管理策略版本演进。不参与当前候选信号的最终审批，不阻塞执行链路。

### memory-store

系统唯一可信持久化状态层，被Harness Engine、commander、strategy-learning-agent、各commander共享访问，不是任何模块的附属。

---

## 三、Harness Engine（系统运行底座，最优先补齐）

```
Harness Engine
├── trigger-engine
├── routing-policy
└── evaluator-agent

memory-store（独立状态层，Harness Engine依赖但不拥有）
```

### trigger-engine

定时 + 事件双触发，系统自启动，不依赖人工发令。

定时触发：每日A股/港股/美股各自收盘后分别触发、每周策略复盘、每月估值扫描、周末长线价值总结

事件触发：行情异动、连续亏损超阈值、最大回撤超阈值、PB分位进入极值区、数据源异常、版本不一致、风控拒绝后再评估请求

### routing-policy

触发后的流程决策统一收口，不散落在各agent prompt里。

职责：决定触发后走哪条工作流、是否强制经过backtest/risk review、管理自动重试规则、管理熔断规则、管理升级commander的条件、区分执行链与学习链、对重复trigger做去重和抑制。

### evaluator-agent

Harness Engine提供的共享评估能力，被金融团队和学习闭环共同使用，不在组织层面重复挂载。

职责：把backtest结果转成结构化评分，为strategy-learning-agent提供可量化学习信号，输出升级/淘汰标准化结论。

典型输出字段：`strategy_version` / `annual_return` / `sharpe` / `win_rate` / `max_drawdown` / `profit_factor` / `score` / `verdict`

verdict枚举：`discard` / `keep` / `candidate_paper` / `candidate_live`

输出对象：strategy-learning-agent / memory-store / fin-commander

---

## 四、独立状态层：memory-store

存储内容：策略版本库、参数历史、回测记录、评估结果、学习动作日志、失败案例、状态流转记录、通知日志、override记录、异常记录、风控拒绝原因、trigger来源记录

建议实现：主存储SQLite，调试/导出JSON

设计原则：所有关键决策可追溯、所有状态变化有时间戳和来源、所有override可审计、不允许绕过状态机直接写终态。

---

## 五、金融团队 — 4层结构

```
fin-commander
├── 第一层·情报层
│   ├── data-agent
│   ├── strategy-agent
│   └── market-agent
├── 第二层·研究层（核心alpha）
│   ├── quant-agent
│   └── value-agent
├── 第三层·验证层
│   ├── backtest-agent
│   └── risk-agent
└── 第四层·调度层
    └── fin-commander
```

### 第一层·情报层

只输出原始素材，不做最终判断。

`data-agent`：数据采集与清洗（富途MCP / Tushare / IEX），输出标准化市场数据和基本面数据

`strategy-agent`：外部策略归纳、TradingView调研、市场研究摘要，只做情报输入，不做建模，不参与策略设计

`market-agent`：行情聚合、异动摘要、观察名单整理，输出候选提醒素材。不拥有最终触发权，不拥有放行权，只生成候选提醒列表。在后段承担候选摘要输出，始终不越权为最终审批方。

### 第二层·研究层（核心alpha）

团队真正的决策生产者，其他agent均为支撑角色。

`quant-agent`：参数化、信号化、规则化建模，接收回测和评估结果决定是否更新参数。不做外部情报收集，不做最终风控放行。

`value-agent`：A股/港股/美股长线估值监控，输出价值评估结论，维护估值区间、极值告警和长期观察结论。

### 第三层·验证层

两者都通过才能进入调度层。

`backtest-agent`：验证策略有效性，结果强制回流给evaluator-agent，必要时同时回流给quant-agent。是学习闭环中的关键验证节点，不是孤立终点。

`risk-agent`：硬闸门（blocking gate），审核候选提醒与候选策略的风险门槛，输出仓位建议、风险评级、止损规则、放行结果。未通过不得进入调度层，如需override必须由commander批准并写入memory-store。

### 第四层·调度层

`fin-commander`：汇总前三层结果，做结论冲突仲裁，输出最终可执行指令，只向commander上报异常与高风险事项。

---

## 六、开发团队 — 3层结构

```
dev-commander
├── 执行层
│   ├── app-agent
│   └── dev-agent
├── 协调层
│   └── pm-agent（升格）
└── 支撑层
    ├── dev-learning-agent
    ├── test-agent
    └── ops-agent
```

### 执行层

`app-agent`：技术方案设计、架构建议、竞品分析、GitHub调研，不做主线编码实现

`dev-agent`：编码实现、Bug修复、工程落地，不负责产品调研和架构决策

### 协调层（升格）

`pm-agent`：承接commander/dev-commander意图，任务拆解、agent分配、依赖关系管理、完成标准定义（DoD）、结果验收。开发团队workflow coordinator，不再只是排期记录员。

### 支撑层

`dev-learning-agent`：工程经验沉淀、代码重构建议、工程优化建议，不直接改主线代码，只负责工程侧学习，不参与策略侧学习

`test-agent`：自动化测试、回归验收、质量门禁

`ops-agent`：运维、部署、监控、告警响应

---

## 七、核心对象模型

### StrategyVersion

表示某一版可回测、可评估、可追踪的策略定义。

关键字段：`version_id` / `parent_version_id` / `strategy_type`（quant/value）/ `target_market` / `params` / `feature_flags` / `created_by` / `created_at` / `status` / `evaluation_ref` / `notes`

status枚举：`draft` → `candidate` → `backtested` → `evaluated` → `accepted_for_paper` → `accepted_for_live` → `deprecated`

### SignalCandidate

表示某一次具体市场条件下产生的候选信号。

关键字段：`signal_id` / `source_strategy_version` / `symbol` / `market` / `direction` / `confidence` / `reason_tags` / `backtest_result_ref` / `risk_result_ref` / `current_status` / `created_at`

current_status枚举：`intel_collected` → `research_generated` → `backtest_pending` → `backtest_passed/failed` → `risk_review_pending` → `approved/rejected` → `notified` → `archived`

---

## 八、State Machine（状态机）

所有状态变化必须写入memory-store，有来源、时间戳、触发原因，不允许绕过状态机直接写终态，override必须显式记录。

### 候选信号生命周期

```
intel_collected → research_generated → backtest_pending
→ backtest_passed / backtest_failed
→ risk_review_pending → approved / rejected
→ notified → archived
```

### 策略版本生命周期

```
draft → candidate → backtested → evaluated
→ accepted_for_paper → accepted_for_live → deprecated
```

---

## 九、权限模型

所有agent必须声明权限边界，分为read / propose / approve / execute四级。

|Agent|read|propose|approve|execute|
|---|---|---|---|---|
|quant-agent|intel/历史策略/回测结果|signal/params/hypothesis|—|—|
|value-agent|估值数据/历史区间|valuation conclusion|—|—|
|backtest-agent|strategy version/历史数据|backtest result|—|执行回测|
|risk-agent|candidate/持仓/drawdown|position_hint/stop_rule|risk pass/fail|—|
|fin-commander|金融链路全量结果|final instruction|team-level dispatch|—|
|strategy-learning-agent|evaluator结果/memory|hypothesis/参数建议|—|—|
|commander|全局|override|high-risk/override|最终批准|

---

## 十、Agent Contract（统一输入输出协议）

所有agent之间数据交接必须使用结构化JSON，禁止依赖自然语言做核心系统交互。

每个agent必须定义：输入类型、输出类型、必填字段、状态码、pass/fail/pending定义。

关键要求：evaluator输出可被strategy-learning-agent自动解析；backtest输出可被evaluator自动读取；risk输出可被fin-commander直接判断是否放行；market输出可被通知系统直接分级处理。

---

## 十一、Exception Escalation Policy（异常升级规则）

### 异常触发条件

数据源中断、回测失败、评估为空、memory-store写入失败、连续亏损超阈值、最大回撤超阈值、信号与持仓冲突、新旧策略版本不一致、trigger重复触发、风控拒绝后仍要求继续放行

### 升级路径

```
agent自检
→ routing-policy / 对应commander
→ 自动重试 / 熔断
→ 升级commander
→ 必要时人工审批并记录override
```

能自动恢复的先自动恢复，高风险/高冲突/不可恢复异常才升级commander，所有升级过程必须留痕。

---

## 十二、跨团队同步机制

目的：确保dev团队代码变更后，金融团队使用同一版本逻辑，避免backtest/risk/live之间的逻辑漂移。

```
app-agent / dev-agent → test-agent → ops-agent
→ deploy-hook
→ quant-agent / backtest-agent / risk-agent / fin-commander 重载最新逻辑
```

约束：未通过test-agent不得进入deploy-hook；schema变更必须显式触发schema-change-hook；所有重载必须记录版本号与时间戳。

---

## 十三、多市场时间调度策略

系统覆盖A股/港股/美股，trigger-engine必须按市场时段分别调度。

A股：A股收盘后进入盘后评估链

港股：港股收盘后进入港股盘后评估链

美股：美股收盘后进入美股盘后评估链

周末：统一执行长线估值复盘和策略周报

跨市场异常事件：进入异步优先级队列，由routing-policy分流

原则：不同市场分开触发、不同时区分开处理、高优先级异常可打断低优先级定时任务。

---

## 十四、通知分级

|级别|发送目标|触发示例|
|---|---|---|
|Level 1·日志|日志 / dashboard / memory-store|数据更新、回测完成、每日扫描|
|Level 2·关注提醒|digest / fin-commander|标的进入观察区、策略进入候选池、估值进入极值区|
|Level 3·异常告警|commander + 你 + 责任agent|回撤超阈值、连续亏损、数据源故障、风控拒绝、版本不一致|

普通事件不打扰commander，只有异常和高风险事项进入commander视野，所有通知必须可追溯。

---

## 十五、观测与审计要求

### 必须记录

每次trigger来源（定时/事件/手动）、每个agent的输入输出摘要、每次状态流转、每次evaluator评分、每次risk fail原因、每次override、每次版本变更、每次部署和重载

### 原则

金融决策链必须可回放、风控拒绝必须可解释、override必须可审计、任意候选信号都应能追溯到来源策略版本和完整审批路径。

---

## 十六、主流程链路

### 短线策略执行链

```
trigger-engine → routing-policy
→ data-agent / strategy-agent / market-agent
→ quant-agent → backtest-agent → evaluator-agent
→ risk-agent（blocking gate）
→ fin-commander → market-agent输出候选摘要
→ commander仅异常时介入
```

### 长线价值执行链

```
trigger-engine → routing-policy
→ data-agent / strategy-agent → value-agent
→ evaluator-agent → risk-agent（blocking gate）
→ fin-commander → market-agent输出观察结论
```

### 策略学习演化链（不阻塞执行链）

```
evaluator-agent → memory-store
→ strategy-learning-agent → 新hypothesis / 参数优化建议
→ backtest-agent → evaluator-agent → memory-store
→ 决定是否升级策略版本 ↺ 循环
```

### 开发变更同步链

```
app-agent / dev-agent → test-agent → ops-agent
→ deploy-hook
→ quant / backtest / risk-agent / fin-commander 重载
```

---

## 十七、一句话总结

**MarketPlayer Agent v2.1 的核心不再是"有哪些agent"，而是系统如何以统一协议、明确状态、独立状态层、权限边界、可审计记录和自动触发机制，自主完成研究—验证—评估—学习—调度闭环，commander只在异常和高风险时介入。**