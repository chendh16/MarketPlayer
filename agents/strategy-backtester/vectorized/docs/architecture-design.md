# 向量化回测引擎架构设计

**版本**: 1.0  
**日期**: 2026-04-06

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    MarketPlayer 系统架构                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                    策略层 (Python)                       │  │
│   │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│   │  │ strategy.py │  │ signal_gen  │  │ risk_manager  │  │  │
│   │  │ 策略定义    │  │ 信号生成    │  │ 风险管理      │  │  │
│   │  └─────────────┘  └──────────────┘  └────────────────┘  │  │
│   └─────────────────────────────────────────────────────────┘  │
│                           ↓                                    │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                 引擎层 (Numba + NumPy)                   │  │
│   │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│   │  │ backtest   │  │ indicators  │  │ position_mgr  │  │  │
│   │  │ 回测引擎    │  │ 指标计算    │  │ 持仓管理      │  │  │
│   │  └─────────────┘  └──────────────┘  └────────────────┘  │  │
│   │                                                         │  │
│   │   @njit 编译 │ 向量化操作 │ JIT 加速                  │  │
│   └─────────────────────────────────────────────────────────┘  │
│                           ↓                                    │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                   数据层 (缓存系统)                      │  │
│   │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│   │  │ Redis 热    │  │ NumPy 缓存  │  │ PostgreSQL    │  │  │
│   │  │ K线数据    │  │ 二进制      │  │ 结果存储      │  │  │
│   │  └─────────────┘  └──────────────┘  └────────────────┘  │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 模块详细设计

### 2.1 策略层

```python
# strategy.py
class Strategy:
    def __init__(self, params: dict):
        self.ma_short = params.get('ma_short', 5)
        self.ma_long = params.get('ma_long', 20)
        self.rsi_period = params.get('rsi_period', 14)
        self.rsi_oversold = params.get('rsi_oversold', 30)
        self.rsi_overbought = params.get('rsi_overbought', 70)
    
    def generate_signals(self, market_data: MarketData) -> SignalArray:
        """向量化信号生成"""
        return generate_signals_vectorized(
            market_data.close,
            market_data.high,
            market_data.low,
            self.ma_short,
            self.ma_long,
            self.rsi_period,
            self.rsi_oversold,
            self.rsi_overbought
        )
```

### 2.2 引擎层

```python
# backtest_engine.py
class BacktestEngine:
    def __init__(self, strategy: Strategy):
        self.strategy = strategy
        self.indicators = IndicatorCalculator()
    
    def run(self, symbols: List[str], start_date: str, end_date: str) -> Results:
        # 1. 批量加载数据
        data = self.load_data_batch(symbols, start_date, end_date)
        
        # 2. 向量化指标计算
        for symbol in symbols:
            data[symbol]['rsi'] = self.indicators.rsi(data[symbol]['close'])
            data[symbol]['ma5'] = self.indicators.ma(data[symbol]['close'], 5)
            data[symbol]['ma20'] = self.indicators.ma(data[symbol]['close'], 20)
        
        # 3. 向量化信号检测
        signals = self.strategy.generate_signals_batch(data)
        
        # 4. 向量化回测
        return self.backtest_vectorized(signals, data)
    
    @njit
    def backtest_vectorized(self, signals, prices, params):
        """Numba 加速回测"""
        # ... 向量化交易逻辑
        return results
```

### 2.3 数据层

```python
# data_loader.py
class DataLoader:
    def __init__(self):
        self.redis = Redis(host='localhost', port=6379)
        self.cache_dir = './data/cache/numpy'
    
    def load_symbol(self, symbol: str, start: str, end: str) -> np.ndarray:
        """优先从 Redis 加载，否则从文件"""
        cache_key = f"klines:{symbol}:{start}:{end}"
        
        # Redis 检查
        cached = self.redis.get(cache_key)
        if cached:
            return np.frombuffer(cached, dtype=np.float64).reshape(-1, 4)
        
        # 文件加载 + 缓存
        data = self.load_from_file(symbol, start, end)
        self.redis.set(cache_key, data.tobytes(), ex=3600)
        
        return data
    
    def load_data_batch(self, symbols: List[str], start: str, end: str) -> dict:
        """批量加载"""
        return {s: self.load_symbol(s, start, end) for s in symbols}
```

---

## 3. 记忆管理集成

### 3.1 学习结果存储

```python
# memory_integration.py
class MemoryIntegration:
    """与 MarketPlayer 记忆系统集成"""
    
    def __init__(self):
        self.db = connect_postgres()
    
    def save_evaluation(self, result: BacktestResult):
        """保存回测结果到数据库"""
        self.db.execute("""
            INSERT INTO backtest_runs 
            (strategy_params, metrics, created_at)
            VALUES ($1, $2, NOW())
        """, [json.dumps(result.params), json.dumps(result.metrics)])
    
    def load_best_params(self) -> dict:
        """从记忆获取最优参数"""
        row = self.db.fetch("""
            SELECT strategy_params 
            FROM backtest_runs 
            ORDER BY sharpe DESC 
            LIMIT 1
        """)
        return json.loads(row['strategy_params']) if row else DEFAULT_PARAMS
```

### 3.2 参数流程

```
用户请求回测
    ↓
MemoryIntegration.load_best_params() → 获取最优参数
    ↓
BacktestEngine.run() → 执行回测
    ↓
save_evaluation() → 保存结果到 backtest_runs
    ↓
strategy-learning-agent → 分析结果，生成新假设
```

---

## 4. 缓存策略

### 4.1 三级缓存

| 级别 | 存储 | 命中率目标 | 更新频率 |
|------|------|------------|----------|
| L1 | Redis | 90% | 实时 |
| L2 | NumPy 文件 | 95% | 日 |
| L3 | PostgreSQL | 100% | 按需 |

### 4.2 缓存键设计

```
# Redis 键
klines:{symbol}:{interval}:{start}:{end}
indicators:{symbol}:{name}:{period}:{start}:{end}
signals:{symbol}:{strategy_hash}:{start}:{end}

# NumPy 缓存文件
/data/cache/numpy/{symbol}_{interval}_{start}_{end}.npy
```

### 4.3 预加载策略

```python
# 每日收盘后预加载次日可能用到的数据
class PrefetchScheduler:
    def prefetch_tomorrow(self):
        symbols = get_active_watchlist()
        
        # 批量预加载明日可能用到的数据
        for symbol in symbols:
            loader.load_symbol(symbol, TOMORROW, TOMORROW + 30)
        
        # 预计算指标
        for symbol in symbols:
            indicators.calculate_ma(symbol, [5, 10, 20, 50])
            indicators.calculate_rsi(symbol, [7, 14, 21])
```

---

## 5. 接口设计

### 5.1 Python API

```python
# api.py
from fastapi import FastAPI

app = FastAPI()

@app.post("/backtest/run")
def run_backtest(request: BacktestRequest):
    engine = BacktestEngine(strategy=request.strategy)
    result = engine.run(
        symbols=request.symbols,
        start_date=request.start,
        end_date=request.end
    )
    return result.to_dict()

@app.get("/backtest/history")
def get_history(limit: int = 100):
    return load_recent_results(limit)
```

### 5.2 Node.js 集成

```javascript
// node-bridge.js
const { spawn } = require('child_process');

async function runBacktest(params) {
    return new Promise((resolve, reject) => {
        const proc = spawn('python3', [
            'api.py',
            '--params', JSON.stringify(params)
        ]);
        
        let output = '';
        proc.stdout.on('data', data => output += data);
        proc.on('close', code => {
            if (code === 0) resolve(JSON.parse(output));
            else reject(new Error(`Exit: ${code}`));
        });
    });
}
```

---

## 6. 部署架构

```
                    ┌─────────────────┐
                    │   Node.js API   │
                    │   (入口)        │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     ┌────────▼────────┐          ┌────────▼────────┐
     │  同步回测       │          │  异步回测      │
     │  (实时响应)    │          │  (后台队列)    │
     └────────┬────────┘          └────────┬────────┘
              │                             │
     ┌────────▼────────┐          ┌────────▼────────┐
     │  Python 进程   │          │ Celery Workers │
     │  (同步调用)    │          │  (多进程)       │
     └────────────────┘          └─────────────────┘
```

---

## 7. 下一步

1. 实现 Python 回测引擎原型
2. 集成测试 Node.js ↔ Python 通信
3. 性能验证

---

*设计结束*