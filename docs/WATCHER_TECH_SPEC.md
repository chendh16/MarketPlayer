# 实时看盘功能 - 技术方案

## 需求确认

| 项目 | 确认 |
|------|------|
| 监控方式 | 定期轮询 (每分钟) ✅ |
| 推送方式 | 飞书 + 邮件 ✅ |
| 监控标的 | 自选股列表 ✅ |
| 告警条件 | 涨跌幅±5%、涨停跌停、放量2x、RSI超买超卖 ✅ |

---

## 技术设计

### 模块架构

```
src/services/market/watcher/
├── index.ts          # 主服务入口
├── watcher.ts        # 轮询核心逻辑
├── detector.ts       # 告警条件检测
├── notifier.ts       # 飞书/邮件推送
├── database.ts       # 规则/日志存储
└── migrations/       # 数据库迁移
    └── 001_watch_tables.sql
```

### 核心功能

1. **轮询服务** - 每分钟获取自选股实时行情
2. **条件检测** - 检测4种告警条件
3. **推送服务** - 飞书webhook + 邮件
4. **规则管理** - CRUD自选股监控规则

### 数据库设计

```sql
-- 监控规则表
CREATE TABLE watch_rules (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  symbol VARCHAR(20),
  market VARCHAR(10),
  conditions JSONB,  -- 监控条件
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 告警日志表
CREATE TABLE watch_alerts (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES watch_rules(id),
  symbol VARCHAR(20),
  condition VARCHAR(50),
  trigger_value FLOAT,
  message TEXT,
  sent_to JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API 设计

```
GET  /api/watch/rules         # 获取监控规则
POST /api/watch/rules         # 添加监控规则
DELETE /api/watch/rules/:id   # 删除监控规则
GET  /api/watch/alerts        # 获取告警历史
```

---

## 开发计划

| 任务 | 预计时间 |
|------|---------|
| 创建数据库表 | 30分钟 |
| 实现轮询服务 | 1小时 |
| 实现告警检测 | 30分钟 |
| 实现推送服务 | 30分钟 |
| 测试联调 | 30分钟 |

**总计**: ~3小时
