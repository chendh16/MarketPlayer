#!/usr/bin/env python3
"""
长线Agent财务数据获取脚本 V2
使用多数据源：东方财富(A股) + Yahoo Finance(美股)
"""

import os
import json
import time
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

import requests
import yfinance as yf

# 配置
DATA_DIR = "data/fundamental"
ERROR_LOG = "data/logs/fetch_errors.log"

STOCKS = {
    "CN": [
        {"code": "600519", "name": "贵州茅台"},
        {"code": "000858", "name": "五粮液"},
        {"code": "300750", "name": "宁德时代"},
        {"code": "601318", "name": "中国平安"},
        {"code": "000333", "name": "美的集团"},
    ],
    "HK": [
        {"code": "00700", "name": "腾讯控股"},
        {"code": "09988", "name": "阿里巴巴-SW"},
        {"code": "03690", "name": "美团-W"},
        {"code": "02318", "name": "中国平安"},
    ],
    "US": [
        {"code": "AAPL", "name": "苹果"},
        {"code": "MSFT", "name": "微软"},
        {"code": "GOOGL", "name": "谷歌A"},
        {"code": "AMZN", "name": "亚马逊"},
        {"code": "NVDA", "name": "英伟达"},
        {"code": "TSLA", "name": "特斯拉"},
        {"code": "META", "name": "Meta"},
    ]
}

def log_error(code, market, error_msg):
    os.makedirs("data/logs", exist_ok=True)
    with open(ERROR_LOG, "a") as f:
        f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | {market}.{code} | {error_msg}\n")

def get_cn_quote(code, name):
    """获取A股实时行情和财务指标"""
    try:
        # 确定市场代码
        if code.startswith('6'):
            market = '1'  # 上交所
        else:
            market = '0'  # 深交所
        
        # 获取实时行情
        url = f'https://push2.eastmoney.com/api/qt/stock/get?secid={market}.{code}&fields=f43,f57,f58,f169,f170,f171,f173,f177,f178'
        r = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
        data = r.json()
        
        if not data.get('data'):
            log_error(code, "CN", "无行情数据")
            return None
        
        d = data['data']
        
        # 字段转换 (东方财富返回的字段需要适当转换)
        close = d.get('f43', 0) / 100  # 价格除以100
        pe = d.get('f162', 0) / 100  # PE除以100
        ps = d.get('f164', 0) / 100  # PS除以100
        pb = d.get('f167', 0) / 100  # PB除以100
        change_pct = d.get('f169', 0) / 100  # 涨跌幅除以100
        gross_margin = d.get('f170', 0) / 10  # 毛利率除以10
        net_margin = d.get('f171', 0) / 10  # 净利率除以10
        roe = d.get('f173', 0)  # ROE直接是百分比
        
        result = {
            "code": code,
            "name": name,
            "market": "CN",
            "last_updated": datetime.now().strftime("%Y-%m-%d"),
            "quote": {
                "close": close,
                "change_pct": change_pct,
                "volume": d.get('f177'),
            },
            "valuation": {
                "pe": pe if pe > 0 else None,
                "pb": pb if pb > 0 else None,
                "ps": ps if ps > 0 else None,
            },
            "profitability": {
                "roe": roe if roe > 0 else None,
                "gross_margin": gross_margin if gross_margin > 0 else None,
                "net_margin": net_margin if net_margin > 0 else None,
            },
            "dividend": {
                "yield": None,
                "payout_ratio": None,
            },
            "growth": {}
        }
        
        print(f"✅ {code} {name} A股数据获取成功")
        return result
        
    except Exception as e:
        log_error(code, "CN", str(e))
        print(f"❌ {code} A股数据获取失败: {e}")
        return None

def get_hk_quote(code, name):
    """获取港股数据 (带重试)"""
    max_retries = 2
    retry_delay = 3
    
    for attempt in range(max_retries):
        try:
            yf_code = f"{code}.HK"
            ticker = yf.Ticker(yf_code)
            
            # 获取历史数据
            hist = ticker.history(period="2y")
            
            if hist.empty:
                log_error(code, "HK", "无历史数据")
                return None
            
            latest = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) > 1 else latest
            change_pct = ((latest['Close'] - prev['Close']) / prev['Close']) * 100 if prev['Close'] else 0
            
            result = {
                "code": code,
                "name": name,
                "market": "HK",
                "last_updated": datetime.now().strftime("%Y-%m-%d"),
                "quote": {
                    "close": latest['Close'],
                    "change_pct": change_pct,
                    "volume": latest['Volume'],
                },
                "valuation": {
                    "pe": None,  # Yahoo Finance港股信息受限
                    "pb": None,
                    "ps": None,
                },
                "profitability": {
                    "roe": None,
                    "gross_margin": None,
                },
                "dividend": {
                    "yield": None,
                    "payout_ratio": None,
                },
                "growth": {}
            }
            
            print(f"✅ {code} {name} 港股数据获取成功")
            return result
            
        except Exception as e:
            if "Rate limited" in str(e) and attempt < max_retries - 1:
                print(f"  ⚠️ {code} 限流，{retry_delay}秒后重试...")
                time.sleep(retry_delay)
            else:
                log_error(code, "HK", str(e))
                print(f"❌ {code} 港股数据获取失败: {e}")
                return None
    
    return None

def get_us_quote(code, name):
    """获取美股数据 (带重试)"""
    max_retries = 3
    retry_delay = 3
    
    for attempt in range(max_retries):
        try:
            ticker = yf.Ticker(code)
            
            # 获取历史数据
            hist = ticker.history(period="2y")
            
            if hist.empty:
                log_error(code, "US", "无历史数据")
                return None
            
            latest = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) > 1 else latest
            change_pct = ((latest['Close'] - prev['Close']) / prev['Close']) * 100 if prev['Close'] else 0
            
            # 尝试获取info (可能失败)
            info = {}
            try:
                info = ticker.info
                time.sleep(1)  # 避免连续请求
            except Exception as e:
                print(f"  ⚠️ {code} info获取失败，使用历史数据: {e}")
            
            result = {
                "code": code,
                "name": name,
                "market": "US",
                "last_updated": datetime.now().strftime("%Y-%m-%d"),
                "quote": {
                    "close": latest['Close'],
                    "change_pct": change_pct,
                    "volume": latest['Volume'],
                },
                "valuation": {
                    "pe": info.get("trailingPE"),
                    "pb": info.get("priceToBook"),
                    "ps": info.get("priceToSalesTrailing12Months"),
                },
                "profitability": {
                    "roe": info.get("returnOnEquity"),
                    "gross_margin": info.get("grossMargins"),
                    "net_margin": info.get("profitMargins"),
                },
                "dividend": {
                    "yield": info.get("dividendYield"),
                    "payout_ratio": info.get("payoutRatio"),
                },
                "growth": {
                    "revenue_growth": info.get("revenueGrowth"),
                }
            }
            
            print(f"✅ {code} {name} 美股数据获取成功")
            return result
            
        except Exception as e:
            if "Rate limited" in str(e) and attempt < max_retries - 1:
                print(f"  ⚠️ {code} 限流，{retry_delay}秒后重试...")
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                log_error(code, "US", str(e))
                print(f"❌ {code} 美股数据获取失败: {e}")
                return None
    
    return None

def save_data(data):
    if data is None:
        return
    
    filepath = f"{DATA_DIR}/{data['code']}_financial.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    print("=" * 50)
    print("长线Agent财务数据获取 V2")
    print("=" * 50)
    
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs("data/logs", exist_ok=True)
    
    # A股
    print("\n📊 获取A股数据...")
    for stock in STOCKS["CN"]:
        data = get_cn_quote(stock["code"], stock["name"])
        if data:
            save_data(data)
        time.sleep(0.5)
    
    # 港股
    print("\n📊 获取港股数据...")
    for stock in STOCKS["HK"]:
        data = get_hk_quote(stock["code"], stock["name"])
        if data:
            save_data(data)
        time.sleep(1)
    
    # 美股
    print("\n📊 获取美股数据...")
    for stock in STOCKS["US"]:
        data = get_us_quote(stock["code"], stock["name"])
        if data:
            save_data(data)
        time.sleep(2)
    
    print("\n" + "=" * 50)
    print("✅ 数据获取完成!")
    print("=" * 50)

if __name__ == "__main__":
    main()