#!/usr/bin/env python3
"""
用AKShare获取港股K线数据
"""

import akshare as ak
import json
import os
from datetime import datetime

DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines'

# 港股20只
HK_STOCKS = [
    ('00700', '腾讯'),
    ('09988', '阿里'),
    ('03690', '美团'),
    ('01810', '小米'),
    ('02318', '平安'),
    ('02628', '中国人寿'),
    ('00939', '建设银行'),
    ('01093', '石药集团'),
    ('00175', '汇丰银行'),
    ('02269', '联想'),
    ('00883', '中海油'),
    ('00981', '中芯国际'),
    ('03888', '金山软件'),
    ('06618', '京东健康'),
    ('09618', '京东'),
    ('09888', '百度'),
    ('09999', '网易'),
    ('02018', '阿里健康'),
    ('01313', '华润置地'),
    ('03333', '中国铁建'),
]

def get_hk_kline(symbol, name):
    """获取港股K线"""
    try:
        print(f"📈 获取 {symbol} {name}...")
        
        # 用AKShare港股接口
        df = ak.stock_hk_hist(symbol=symbol, period="daily", 
                              start_date="20240101", 
                              end_date=datetime.now().strftime("%Y%m%d"))
        
        if df is None or df.empty:
            print(f"❌ {symbol}: 无数据")
            return False
        
        # 转换格式
        data = []
        for _, row in df.iterrows():
            data.append({
                'date': str(row['日期']),
                'open': float(row['开盘']),
                'high': float(row['最高']),
                'low': float(row['最低']),
                'close': float(row['收盘']),
                'volume': int(row['成交量'])
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
    print("=== 用AKShare获取港股数据 ===\n")
    
    success = 0
    for symbol, name in HK_STOCKS:
        if get_hk_kline(symbol, name):
            success += 1
    
    print(f"\n=== 完成: {success}/{len(HK_STOCKS)} ===")

if __name__ == '__main__':
    main()
