#!/usr/bin/env python3
"""
用Yahoo Finance获取港股K线数据
"""

import yfinance as yf
import json
import os
from datetime import datetime

DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines'

# 港股20只 (Yahoo代码)
HK_STOCKS = [
    ('0700.HK', '00700', '腾讯'),
    ('9988.HK', '09988', '阿里'),
    ('3690.HK', '03690', '美团'),
    ('1810.HK', '01810', '小米'),
    ('2318.HK', '02318', '平安'),
    ('2628.HK', '02628', '中国人寿'),
    ('0939.HK', '00939', '建设银行'),
    ('1093.HK', '01093', '石药'),
    ('0015.HK', '00175', '汇丰'),
    ('2269.HK', '02269', '联想'),
    ('0883.HK', '00883', '中海油'),
    ('0981.HK', '00981', '中芯'),
    ('3888.HK', '03888', '金山'),
    ('6618.HK', '06618', '京东健康'),
    ('9618.HK', '09618', '京东'),
    ('9888.HK', '09888', '百度'),
    ('9999.HK', '09999', '网易'),
    ('2018.HK', '02018', '阿里健康'),
    ('1313.HK', '01313', '华润置地'),
    ('3333.HK', '03333', '中国铁建'),
]

def get_hk_kline(yahoo_code, symbol, name):
    """获取港股K线"""
    try:
        print(f"📈 获取 {symbol} {name}...")
        
        ticker = yf.Ticker(yahoo_code)
        df = ticker.history(period="2y")
        
        if df is None or df.empty:
            print(f"❌ {symbol}: 无数据")
            return False
        
        # 转换格式
        data = []
        for date, row in df.iterrows():
            data.append({
                'date': date.strftime('%Y-%m-%d'),
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close']),
                'volume': int(row['Volume'])
            })
        
        # 保存
        filepath = os.path.join(DATA_DIR, f"hk_{symbol}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"✅ hk_{symbol}: {len(data)}条")
        return True
        
    except Exception as e:
        print(f"❌ {symbol}: {str(e)[:60]}")
        return False

def main():
    print("=== 用Yahoo Finance获取港股数据 ===\n")
    
    success = 0
    for yahoo_code, symbol, name in HK_STOCKS:
        if get_hk_kline(yahoo_code, symbol, name):
            success += 1
    
    print(f"\n=== 完成: {success}/{len(HK_STOCKS)} ===")

if __name__ == '__main__':
    main()
