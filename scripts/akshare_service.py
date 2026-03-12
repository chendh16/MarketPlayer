#!/usr/bin/env python3
"""
快速金融数据服务
使用 HTTP API 直接获取数据，比 AKShare 更快
"""

import json
import sys

# 使用简单的 HTTP 请求获取数据
try:
    import requests
except ImportError:
    import urllib.request as requests

def get_index_zh_a():
    """获取A股大盘指数"""
    try:
        # 上证指数
        url1 = 'https://push2.eastmoney.com/api/qt/stock/get?secid=1.000001&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f57,f58,f59,f60'
        # 深证成指
        url2 = 'https://push2.eastmoney.com/api/qt/stock/get?secid=0.399001&fields=f43,f60'
        
        r1 = requests.get(url1, timeout=5).json()
        r2 = requests.get(url2, timeout=5).json()
        
        data = []
        if r1.get('data'):
            d = r1['data']
            data.append({
                '代码': '000001',
                '名称': '上证指数',
                '最新价': d['f43'] / 10000,
                '涨跌幅': ((d['f43'] - d['f60']) / d['f60'] * 100) if d.get('f60') else 0
            })
        if r2.get('data'):
            d = r2['data']
            data.append({
                '代码': '399001',
                '名称': '深证成指',
                '最新价': d['f43'] / 10000,
                '涨跌幅': ((d['f43'] - d['f60']) / d['f60'] * 100) if d.get('f60') else 0
            })
        
        return {'success': True, 'data': data}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_stock_info(symbol):
    """获取个股基本信息"""
    try:
        secid = ('1.' + symbol) if symbol.startswith('6') else ('0.' + symbol)
        url = f'https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fields=f57,f58,f84,f85,f116,f117,f127,f128,f162,f163,f164,f167,f168,f169,f170,f171,f187,f188,f189,f190,f191,f192,f193,f194,f197,f198,f199,f200,f201,f202,f203,f204,f205,f206'
        
        r = requests.get(url, timeout=5).json()
        if r.get('data'):
            d = r['data']
            return {'success': True, 'data': {
                '股票代码': d.get('f57', ''),
                '股票简称': d.get('f58', ''),
                '最新价': d.get('f43', 0) / 10000,
                '涨跌幅': d.get('f170', 0) / 100,
                '总市值': d.get('f84', 0) / 100000000,
                '流通市值': d.get('f85', 0) / 100000000,
                '市盈率': d.get('f162', ''),
                '市净率': d.get('f167', ''),
                '总股本': d.get('f84', 0) / 100000000,
                '流通股': d.get('f85', 0) / 100000000,
            }}
        return {'success': False, 'error': 'No data'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_fund_flow(stock, market='sh'):
    """获取资金流向 (简化版)"""
    try:
        # 使用摆盘数据近似
        secid = ('1.' + stock) if stock.startswith('6') else ('0.' + stock)
        url = f'https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fields=f84,f85,f187,f188,f189,f190'
        
        r = requests.get(url, timeout=5).json()
        if r.get('data'):
            d = r['data']
            return {'success': True, 'data': {
                '主力净流入': d.get('f187', 0) / 10000,
                '超大单净流入': d.get('f188', 0) / 10000,
                '大单净流入': d.get('f189', 0) / 10000,
                '中单净流入': d.get('f190', 0) / 10000,
            }}
        return {'success': False, 'error': 'No data'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: akshare_service.py <action> [params]'}))
        sys.exit(1)
    
    action = sys.argv[1]
    result = {'success': False, 'error': 'Unknown action'}
    
    if action == 'stock_info':
        symbol = sys.argv[2] if len(sys.argv) > 2 else '600519'
        result = get_stock_info(symbol)
    
    elif action == 'fund_flow':
        symbol = sys.argv[2] if len(sys.argv) > 2 else '600519'
        market = sys.argv[3] if len(sys.argv) > 3 else 'sh'
        result = get_fund_flow(symbol, market)
    
    elif action == 'market':
        result = get_index_zh_a()
    
    elif action == 'north_flow':
        # 北向资金 - 简化返回
        result = {'success': True, 'data': {'message': '北向资金需完整AKShare支持'}}
    
    else:
        result = {'success': False, 'error': f'Unknown action: {action}'}
    
    print(json.dumps(result, ensure_ascii=False, default=str))

if __name__ == '__main__':
    main()
