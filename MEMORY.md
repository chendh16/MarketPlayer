# MEMORY.md - 长期记忆

## Agent 团队架构 (2026-03-09)

```
用户
└── commander（总指挥）
    ├── dev-commander（开发团队负责人）
    │   ├── app-agent（产品研究）
    │   ├── pm-agent（任务排期）
    │   ├── dev-agent（开发）
    │   ├── test-agent（测试）
    │   └── ops-agent（运维）
    └── fin-commander（金融团队负责人）
        ├── data-agent（数据）
        ├── quant-agent（量化）
        ├── value-agent（价值）
        ├── backtest-agent（回测）
        ├── market-agent（市场）
        └── risk-agent（风控）
```

## 重要规则 (2026-03-17)

### ⚠️ 每天必须检查运营状态

1. **新闻分析** - 必须推送给用户
2. **实盘分析** - 必须推送给用户
3. **日报任务** - 每天 09:00 和 16:00 必须发送
4. **服务运行状态** - 确保系统正常运行

**这是硬性要求，任何分析报告必须主动推送给用户，不能等待用户询问。**

---

## 项目

- **MarketPlayer**: AI Trading Assistant for Chinese Investors
- 位于: `/workspace/`

---

持续更新中...
