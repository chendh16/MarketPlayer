#!/usr/bin/env python3
"""
批量下载K线数据
使用 yfinance 批量下载美股和港股数据
"""

import os
import json
import time
import yfinance as yf
from datetime import datetime, timedelta

# 配置
DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines'
BATCH_SIZE = 10
DELAY_SEC = 2

# 优先下载列表
US_STOCKS = [
    'JPM', 'BAC', 'WMT', 'HD', 'COST', 'JNJ', 'PFE', 'XOM', 'CVX', 'DIS',
    'NFLX', 'INTC', 'CSCO', 'ORCL', 'CRM', 'ADBE', 'AMD', 'QCOM', 'TXN', 'IBM',
    'MCD', 'SBUX', 'NKE', 'TGT', 'LOW', 'KO', 'PEP', 'PG', 'CL', 'KMB',
    'BA', 'CAT', 'DE', 'HON', 'UPS', 'RTX', 'LMT', 'GE', 'MMM', 'AVGO',
    'UNH', 'LLY', 'MRK', 'ABBV', 'AMGN', 'GILD', 'BMY', 'CVS', 'CI', 'HUM',
    'GS', 'MS', 'C', 'BLK', 'SCHW', 'AXP', 'SPGI', 'MCO', 'COF', 'TFC',
]

# 港股代码需要加.HK后缀
HK_STOCKS = [
    '03968', '00914', '00941', '01299', '02318', '02628', '01398', '00388', '00883', '01113',  # 银行
    '00001', '00017', '00016', '00175', '06808',  # 地产
    '02269', '02120', '09618', '09888', '09955', '06381',  # 互联网
    '01928', '01169', '02272',  # 博彩/消费
    '02569', '02285', '01093', '06186',  # 消费/医药
]

def get_us_kline(symbol):
    """获取美股K线"""
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period='2y', interval='1d')
        
        if df.empty:
            return None
            
        klines = []
        for idx, row in df.iterrows():
            klines.append({
                'date': idx.strftime('%Y-%m-%d'),
                'open': round(float(row['Open']), 2),
                'high': round(float(row['High']), 2),
                'low': round(float(row['Low']), 2),
                'close': round(float(row['Close']), 2),
                'volume': int(row['Volume'])
            })
        
        return {
            'symbol': symbol,
            'market': 'us',
            'klines': klines,
            'updated_at': datetime.now().isoformat()
        }
    except Exception as e:
        print(f"❌ {symbol}: {e}")
        return None

def get_hk_kline(symbol):
    """获取港股K线"""
    try:
        ticker = yf.Ticker(f"{symbol}.HK")
        df = ticker.history(period='2y', interval='1d')
        
        if df.empty:
            return None
            
        klines = []
        for idx, row in df.iterrows():
            klines.append({
                'date': idx.strftime('%Y-%m-%d'),
                'open': round(float(row['Open']), 2),
                'high': round(float(row['High']), 2),
                'low': round(float(row['Low']), 2),
                'close': round(float(row['Close']), 2),
                'volume': int(row['Volume'])
            })
        
        return {
            'symbol': f"{symbol}.HK",
            'market': 'hk',
            'klines': klines,
            'updated_at': datetime.now().isoformat()
        }
    except Exception as e:
        print(f"❌ HK.{symbol}: {e}")
        return None

def save_kline(data, market):
    """保存K线数据"""
    if not data:
        return False
    
    filename = f"{market}_{data['symbol'].replace('.HK', '')}.json"
    filepath = os.path.join(DATA_DIR, filename)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    return True

def download_batch(stocks, market, prefix=''):
    """批量下载"""
    results = []
    
    for i, symbol in enumerate(stocks):
        print(f"[{i+1}/{len(stocks)}] 下载 {prefix}{symbol}...", end=' ')
        
        if market == 'us':
            data = get_us_kline(symbol)
        else:
            data = get_hk_kline(symbol)
        
        if data and save_kline(data, market):
            kline_count = len(data.get('klines', []))
            print(f"✅ {kline_count}条")
            results.append((symbol, kline_count))
        else:
            print("❌ 无数据")
        
        # 避免限流
        if i < len(stocks) - 1:
            time.sleep(DELAY_SEC)
    
    return results

def main():
    print("=" * 50)
    print("批量下载K线数据")
    print("=" * 50)
    
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # 下载美股
    print(f"\n📈 下载美股 ({len(US_STOCKS)}只)")
    print("-" * 30)
    us_results = download_batch(US_STOCKS, 'us')
    
    # 下载港股
    print(f"\n📊 下载港股 ({len(HK_STOCKS)}只)")
    print("-" * 30)
    hk_results = download_batch(HK_STOCKS, 'hk')
    
    # 统计
    print("\n" + "=" * 50)
    print("下载完成统计")
    print("=" * 50)
    
    us_success = len(us_results)
    hk_success = len(hk_results)
    
    print(f"美股: {us_success}/{len(US_STOCKS)} 成功")
    print(f"港股: {hk_success}/{len(HK_STOCKS)} 成功")
    
    total_us = len([f for f in os.listdir(DATA_DIR) if f.startswith('us_')])
    total_hk = len([f for f in os.listdir(DATA_DIR) if f.startswith('hk_')])
    
    print(f"\n总计:")
    print(f"美股: {total_us} 只")
    print(f"港股: {total_hk} 只")

if __name__ == '__main__':
    main()