#!/usr/bin/env python3
"""
Vectorized Backtester Entry Point
接收参数，加载数据，运行回测，返回JSON结果
"""

import json
import sys
import os
import numpy as np

# 添加路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.backtester import VectorizedBacktester, StrategyParams


class KlinesData:
    """K线数据容器"""
    def __init__(self, closes, highs, lows, timestamps):
        self.close = np.array(closes, dtype=np.float64)
        self.high = np.array(highs, dtype=np.float64)
        self.low = np.array(lows, dtype=np.float64)
        self.timestamps = timestamps


class IndicatorsData:
    """指标数据容器"""
    def __init__(self, data):
        self.data = data
    
    def get(self, key, default=None):
        return self.data.get(key, default)
    
    def __getitem__(self, key):
        return self.data.get(key)


def load_klines(symbol, data_dir):
    """加载K线数据"""
    # 尝试多个可能的文件名
    file_paths = [
        os.path.join(data_dir, f"us_{symbol}.json"),  # 美股
        os.path.join(data_dir, f"hk_{symbol}.json"),  # 港股
        os.path.join(data_dir, f"a_{symbol}.json"),   # A股
        os.path.join(data_dir, f"{symbol}.json"),     # 通用
    ]
    
    file_path = None
    for fp in file_paths:
        if os.path.exists(fp):
            file_path = fp
            break
    
    if not file_path:
        return None
    
    with open(file_path, 'r') as f:
        data = json.load(f)

    # 处理两种数据格式: {klines: [...]} 或直接 [...]
    if isinstance(data, list):
        klines = data
    else:
        klines = data.get('klines', [])

    if not klines:
        return None
    
    closes = []
    highs = []
    lows = []
    for k in klines:
        close_val = k.get('close') or k.get('close_price') or k.get('c') or 0
        high_val = k.get('high') or k.get('high_price') or k.get('h') or close_val
        low_val = k.get('low') or k.get('low_price') or k.get('l') or close_val

        try:
            closes.append(float(close_val))
            highs.append(float(high_val))
            lows.append(float(low_val))
        except (ValueError, TypeError):
            # 跳过无效数据
            continue

    if len(closes) < 50:
        return None

    timestamps = list(range(len(closes)))
    
    return KlinesData(closes, highs, lows, timestamps)


def calculate_indicators(klines, ma_short=5, ma_long=20, rsi_period=14):
    """计算技术指标 (动态参数)"""
    close = klines.close

    # MA (动态周期)
    ma_short_arr = np.zeros(len(close))
    ma_long_arr = np.zeros(len(close))
    for i in range(len(close)):
        ma_short_arr[i] = np.mean(close[max(0, i-ma_short+1):i+1]) if i >= ma_short-1 else np.nan
        ma_long_arr[i] = np.mean(close[max(0, i-ma_long+1):i+1]) if i >= ma_long-1 else np.nan

    # RSI (动态周期)
    rsi = np.zeros(len(close))
    for i in range(rsi_period, len(close)):
        gains = []
        losses = []
        for j in range(max(1, i-rsi_period+1), i+1):
            change = close[j] - close[j-1]
            if change > 0:
                gains.append(change)
            else:
                losses.append(-change)
        avg_gain = np.mean(gains) if gains else 0
        avg_loss = np.mean(losses) if losses else 0
        rs = avg_gain / (avg_loss + 0.0001)
        rsi[i] = 100 - (100 / (1 + rs))

    rsi[:rsi_period] = np.nan

    return {
        f'ma{ma_short}': ma_short_arr,
        f'ma{ma_long}': ma_long_arr,
        f'rsi{rsi_period}': rsi
    }


def main():
    try:
        # 从stdin读取参数
        params = json.load(sys.stdin)
        
        # 解析参数
        strategy_params = StrategyParams(
            ma_short=params.get('ma_short', 5),
            ma_long=params.get('ma_long', 20),
            rsi_period=params.get('rsi_period', 14),
            rsi_oversold=params.get('rsi_oversold', 30),
            rsi_overbought=params.get('rsi_overbought', 70),
            stop_loss_pct=params.get('stop_loss_pct', 0.05),
            profit_target_pct=params.get('profit_target_pct', 0.12),
            max_hold_days=params.get('max_hold_days', 10)
        )
        
        symbols = params.get('symbols', ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META'])
        data_dir = params.get('data_dir', 'data/cache/klines')
        
        # 确保data_dir是绝对路径
        if not os.path.isabs(data_dir):
            # 使用环境变量或当前工作目录
            workspace = os.environ.get('WORKSPACE', os.getcwd())
            data_dir = os.path.join(workspace, data_dir)
        
        # 加载数据并计算指标
        klines_dict = {}
        indicators_dict = {}
        
        for symbol in symbols:
            klines = load_klines(symbol, data_dir)
            if klines and len(klines.close) > 50:
                klines_dict[symbol] = klines
                indicators_dict[symbol] = calculate_indicators(
                    klines,
                    strategy_params.ma_short,
                    strategy_params.ma_long,
                    strategy_params.rsi_period
                )
        
        if not klines_dict:
            print(json.dumps({'success': False, 'error': 'No data loaded'}))
            sys.exit(1)
        
        # 运行回测
        backtester = VectorizedBacktester(strategy_params)
        results = backtester.run(klines_dict, indicators_dict)
        
        # 输出JSON结果
        output = {
            'success': True,
            'results': [
                {
                    'symbol': symbol,
                    'trade_count': r.trade_count,
                    'total_return': r.total_return,
                    'sharpe': r.sharpe,
                    'max_drawdown': r.max_drawdown,
                    'win_rate': r.win_rate,
                    'avg_win': r.avg_win,
                    'avg_loss': r.avg_loss,
                    'profit_factor': r.profit_factor,
                    'avg_hold_days': r.avg_hold_days
                }
                for symbol, r in results.items()
            ]
        }
        print(json.dumps(output))
        
    except Exception as e:
        import traceback
        error_output = {
            'success': False,
            'error': str(e),
            'trace': traceback.format_exc()
        }
        print(json.dumps(error_output))
        sys.exit(1)


if __name__ == '__main__':
    main()