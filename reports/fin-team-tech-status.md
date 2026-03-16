# 金融团队 - 技术现状与需求分析

## 一、现有技术架构

### 1.1 交易执行接口

| 平台 | 文件 | 功能 | 状态 |
|------|------|------|------|
| **虚拟盘** | `services/virtual/` | 模拟交易 | ✅ 可用 |
| **富途** | `services/futu/` | 实盘交易 | ⚠️ 需配置 |
| **长桥** | `services/longbridge/` | 实盘交易 | ⚠️ 需配置 |

### 1.2 现有API列表

```
虚拟盘 (已实现):
├── init_virtual_account    # 初始化账户
├── get_virtual_account    # 获取账户状态
├── reset_virtual_account  # 重置账户
├── virtual_buy           # 买入 (做多)
├── virtual_sell          # 卖出 (平多)
├── virtual_short         # 做空
├── virtual_cover        # 平空
├── get_virtual_positions # 获取持仓
├── get_virtual_orders   # 获取订单
└── get_virtual_summary  # 账户汇总

富途 (已实现):
├── executeFutuOrder     # 执行订单
├── cancelFutuOrder      # 取消订单
└── getFutuPosition     # 获取持仓

长桥 (已实现):
├── executeLongbridgeOrder  # 执行订单
└── cancelLongbridgeOrder  # 取消订单
```

---

## 二、当前工作流程

```
金融团队策略 (fin-team/auto-trader.ts)
    │
    ▼
生成交易信号 (TradeSignal)
    │
    ├── 虚拟盘执行 ──→ virtual_buy/sell/short/cover
    │
    └── 实盘执行 ──→ futu/longbridge API
```

---

## 三、缺乏的技术点

### 3.1 策略层面

| 序号 | 技术点 | 优先级 | 说明 |
|------|--------|--------|------|
| 1 | 产业链因子策略 | ✅ 已完成 | 事件驱动+产业传导 |
| 2 | 多因子策略 | P1 | 技术面+基本面融合 |
| 3 | 择时策略 | P2 | 大盘择时、风控 |
| 4 | 轮动策略 | P2 | 行业/风格轮动 |

### 3.2 执行层面

| 序号 | 技术点 | 优先级 | 说明 |
|------|--------|--------|------|
| 1 | 富途实盘对接 | P1 | 需要配置API密钥 |
| 2 | 长桥实盘对接 | P1 | 需要配置API密钥 |
| 3 | 模拟交易验证 | P1 | 先虚拟盘验证策略 |
| 4 | 风险控制 | P1 | 止损/仓位管理 |

### 3.3 数据层面

| 序号 | 技术点 | 优先级 | 说明 |
|------|--------|--------|------|
| 1 | 实时行情 | P0 | 延迟需要优化 |
| 2 | 历史回测 | P1 | 完善回测引擎 |
| 3 | 因子库 | P2 | 因子存储与计算 |

---

## 四、富途牛牛虚拟盘API

### 4.1 现有接口状态

| 接口 | 状态 | 说明 |
|------|------|------|
| 持仓查询 | ✅ 可用 | get_virtual_positions |
| 订单执行 | ✅ 可用 | virtual_buy/sell |
| 账户初始化 | ✅ 可用 | init_virtual_account |
| 账户重置 | ✅ 可用 | reset_virtual_account |

### 4.2 所需配置

```env
# 虚拟盘 (无需配置)
VIRTUAL_INITIAL_CASH=1000000

# 富途实盘 (需要配置)
FUTU_TRADING_ENV=simulate  # 仿真/实盘
FUTU_CN_ACCOUNT=xxx
FUTU_CN_PASSWORD=xxx

# 长桥 (需要配置)
LONG_BRIDGE_TOKEN=xxx
```

---

## 五、待完成任务

### 5.1 短期 (本周)

- [x] 产业链因子开发
- [x] 混合引擎整合
- [ ] 虚拟盘策略回测
- [ ] 富途API配置

### 5.2 中期 (下周)

- [ ] 多因子策略开发
- [ ] 实盘对接测试
- [ ] 风控模块完善

### 5.3 长期 (本月)

- [ ] 策略组合优化
- [ ] 实盘模拟交易
- [ ] 完整回测验证

---

*生成时间: 2026-03-17*
