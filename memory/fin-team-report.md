---

## 💬 团队沟通记录

### 虚拟盘需求 (14:52)

**用户**: 我想要开一些虚拟盘来进行一个模拟的练习，可以看一下哪一些能开一个虚拟账户。然后让金融团队看一下能否调用开发团队开发的东西进行虚拟盘的操作。

**commander (总指挥)**: 收到，正在分析虚拟盘方案。

---

## 📊 虚拟盘方案分析

### 可行性方案

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A. 独立虚拟盘系统** | 完全模拟交易系统 | 独立可控 | 开发周期长 |
| **B. 复用现有持仓系统** | 用虚拟持仓模拟 | 开发快 | 需要适配 |
| **C. 第三方模拟API** | 用模拟交易API | 功能全 | 依赖外部 |

### 推荐: 方案B - 复用现有架构

**现有能力**:
- ✅ 持仓管理 (positions)
- ✅ 订单系统 (orders)
- ✅ 风控检查 (risk)
- ✅ MCP工具 (行情/分析/估值)
- ✅ 实时看盘 (watcher)

**需要开发**:
1. 虚拟账户管理
2. 虚拟资金初始化
3. 虚拟下单/卖接口
4. 虚拟持仓跟踪
5. 盈亏计算

### 技术架构

```
虚拟盘模块 (src/services/virtual/)
├── account.ts      # 虚拟账户
├── order.ts       # 虚拟下单
├── position.ts    # 虚拟持仓
├── profit.ts      # 盈亏计算
└── database.ts    # 虚拟盘数据
```

**可调用现有工具**:
- fetch_realtime_quote (实时行情)
- calculate_valuation (估值)
- calculate_risk (风险)
- analyze_stock_sentiment (舆情)
- 实时看盘 (watcher)

---

## ⚙️ 需求确认 (14:56)

**用户确认**:
- ✅ 虚拟资金: 100万人民币
- ✅ 交易方向: 做多 + 做空
- ✅ 模拟市场: 美股 + 港股
- ✅ 调用API: 富途 / 长桥

**技术方案**: 复用富途/长桥API接口

---

## 🔧 技术方案

### 方案: 复用现有Broker API

**调用现有接口**:
- 富途 OpenAPI: 实时行情、历史K线
- 长桥 API: 实时行情

**虚拟盘架构**:
```
src/services/virtual/
├── account.ts      # 100万虚拟账户
├── order.ts       # 虚拟下单(做多/做空)
├── position.ts    # 虚拟持仓跟踪
├── profit.ts      # 实时盈亏计算
└── database.ts   # 虚拟盘数据
```

**现有可复用**:
- futu/quote-service.ts (富途行情)
- longbridge/quote.ts (长桥行情)
- 风控逻辑

**预计工作量**: 2-3小时

---

## ✅ 开发完成 (14:56)

**虚拟盘功能已实现**!

### 功能清单

| 功能 | 说明 |
|------|------|
| init_virtual_account | 初始化虚拟账户 (默认100万) |
| virtual_buy | 买入做多 |
| virtual_sell | 卖出平仓 |
| virtual_short | 做空 |
| virtual_cover | 买回平空 |
| get_virtual_positions | 获取持仓 |
| get_virtual_orders | 订单历史 |
| get_virtual_summary | 账户摘要 |

### 支持市场
- ✅ 美股 (US)
- ✅ 港股 (HK)

### 可调用现有工具
- 实时行情 (quote-service)
- 技术指标
- 风险计算
- 舆情分析
