"""
data_loader.py - 数据层 (纯 Python 版本)
"""

import os
import json
import numpy as np


class KLineData:
    """K线数据结构"""
    
    def __init__(self, symbol, close, open_prices, high, low, volume, timestamps):
        self.symbol = symbol
        self.close = close
        self.open = open_prices
        self.high = high
        self.low = low
        self.volume = volume
        self.timestamps = timestamps
    
    @property
    def length(self):
        return len(self.close)


class DataLoader:
    """数据加载器"""
    
    def __init__(self, data_dir=None):
        # Find the data directory relative to project root
        import os
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        default_dir = os.path.join(base, 'data', 'cache', 'klines')
        
        # 尝试多个可能路径
        possible_paths = [
            data_dir,
            default_dir,
            os.path.join(os.path.expanduser('~'), '.openclaw', 'workspace', 'MarketPlayer', 'data', 'cache', 'klines'),
            '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines',
        ]
        
        for path in possible_paths:
            if path and os.path.exists(path):
                self.data_dir = path
                break
        else:
            self.data_dir = default_dir
    
    def load_klines(self, symbol):
        paths = [
            os.path.join(self.data_dir, f'us_{symbol}.json'),
            os.path.join(self.data_dir, f'{symbol}.json'),
        ]
        
        for file_path in paths:
            if os.path.exists(file_path):
                return self._load_from_file(file_path, symbol)
        
        return None
    
    def _load_from_file(self, file_path, symbol):
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        klines = data.get('klines', [])
        n = len(klines)
        
        close = np.zeros(n, dtype=np.float64)
        open_prices = np.zeros(n, dtype=np.float64)
        high = np.zeros(n, dtype=np.float64)
        low = np.zeros(n, dtype=np.float64)
        volume = np.zeros(n, dtype=np.float64)
        timestamps = np.zeros(n, dtype=np.int64)
        
        for i, k in enumerate(klines):
            close[i] = float(k.get('close', 0))
            open_prices[i] = float(k.get('open', 0))
            high[i] = float(k.get('high', 0))
            low[i] = float(k.get('low', 0))
            volume[i] = float(k.get('volume', 0))
            ts = k.get('timestamp') or k.get('time') or 0
            timestamps[i] = int(ts) if ts else i
        
        return KLineData(symbol, close, open_prices, high, low, volume, timestamps)
    
    def load_batch(self, symbols):
        result = {}
        for symbol in symbols:
            data = self.load_klines(symbol)
            if data:
                result[symbol] = data
        return result


__all__ = ['DataLoader', 'KLineData']