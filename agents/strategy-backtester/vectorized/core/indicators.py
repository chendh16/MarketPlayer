"""
indicators.py - 指标计算层 (Python 实现)
"""

import numpy as np


class IndicatorCalculator:
    """指标计算器"""
    
    def sma(self, prices, period):
        """简单移动平均"""
        n = len(prices)
        result = np.zeros(n, dtype=np.float64)
        
        for i in range(period - 1, n):
            result[i] = np.mean(prices[i - period + 1:i + 1])
        
        result[:period - 1] = np.nan
        return result
    
    def ema(self, prices, period):
        """指数移动平均"""
        n = len(prices)
        result = np.zeros(n, dtype=np.float64)
        multiplier = 2.0 / (period + 1)
        
        result[period - 1] = np.mean(prices[:period])
        
        for i in range(period, n):
            result[i] = (prices[i] - result[i - 1]) * multiplier + result[i - 1]
        
        result[:period - 1] = np.nan
        return result
    
    def rsi(self, prices, period=14):
        """RSI"""
        n = len(prices)
        result = np.zeros(n, dtype=np.float64)
        
        if n <= period:
            return result
        
        changes = np.diff(prices)
        
        avg_gain = 0.0
        avg_loss = 0.0
        
        for i in range(period):
            result[i] = np.nan
            if changes[i] > 0:
                avg_gain += changes[i]
            else:
                avg_loss -= changes[i]
        
        avg_gain /= period
        avg_loss /= period
        
        if avg_loss == 0:
            result[period] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[period] = 100.0 - (100.0 / (1.0 + rs))
        
        for i in range(period + 1, n):
            change = changes[i - 1]
            
            if change > 0:
                avg_gain = (avg_gain * (period - 1) + change) / period
                avg_loss = (avg_loss * (period - 1)) / period
            else:
                avg_gain = (avg_gain * (period - 1)) / period
                avg_loss = (avg_loss * (period - 1) - change) / period
            
            if avg_loss == 0:
                result[i] = 100.0
            else:
                rs = avg_gain / avg_loss
                result[i] = 100.0 - (100.0 / (1.0 + rs))
        
        return result
    
    def atr(self, high, low, close, period=14):
        """ATR"""
        n = len(high)
        result = np.zeros(n, dtype=np.float64)
        
        if n < 2:
            return result
        
        tr = np.zeros(n, dtype=np.float64)
        tr[0] = high[0] - low[0]
        
        for i in range(1, n):
            h_l = high[i] - low[i]
            h_c = abs(high[i] - close[i - 1])
            l_c = abs(low[i] - close[i - 1])
            tr[i] = max(h_l, h_c, l_c)
        
        result[period - 1] = np.mean(tr[:period])
        
        for i in range(period, n):
            result[i] = (result[i - 1] * (period - 1) + tr[i]) / period
        
        result[:period - 1] = np.nan
        return result
    
    def bollinger_bands(self, prices, period=20, num_std=2.0):
        """布林带"""
        n = len(prices)
        middle = np.zeros(n, dtype=np.float64)
        upper = np.zeros(n, dtype=np.float64)
        lower = np.zeros(n, dtype=np.float64)
        
        for i in range(n):
            if i < period - 1:
                middle[i] = np.nan
                upper[i] = np.nan
                lower[i] = np.nan
            else:
                segment = prices[i - period + 1:i + 1]
                mean = np.mean(segment)
                std = np.std(segment)
                
                middle[i] = mean
                upper[i] = mean + num_std * std
                lower[i] = mean - num_std * std
        
        return middle, upper, lower
    
    def compute_all(self, klines):
        """计算所有常用指标"""
        close = klines.close
        high = klines.high
        low = klines.low
        
        return {
            'ma5': self.sma(close, 5),
            'ma10': self.sma(close, 10),
            'ma20': self.sma(close, 20),
            'ma50': self.sma(close, 50),
            'rsi14': self.rsi(close, 14),
            'atr14': self.atr(high, low, close, 14),
        }


class BatchIndicatorCalculator:
    """批量指标计算器"""
    
    def __init__(self):
        self.calc = IndicatorCalculator()
    
    def compute_for_symbols(self, klines_dict, indicators=None):
        """为多只股票计算指标"""
        if indicators is None:
            indicators = ['ma5', 'ma20', 'rsi14', 'atr14']
        
        results = {}
        
        for symbol, klines in klines_dict.items():
            results[symbol] = {}
            
            ind = self.calc.compute_all(klines)
            results[symbol].update(ind)
        
        return results


__all__ = ['IndicatorCalculator', 'BatchIndicatorCalculator']