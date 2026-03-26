#!/usr/bin/env python3
"""获取港股和美股数据 - 纯历史数据版"""
import yfinance as yf
import time
import json

stocks = {
    "HK": [
        ("00700", "腾讯控股"),
        ("09988", "阿里巴巴-SW"),
        ("03690", "美团-W"),
        ("02318", "中国平安"),
    ],
    "US": [
        ("AAPL", "苹果"),
        ("MSFT", "微软"),
        ("GOOGL", "谷歌A"),
        ("AMZN", "亚马逊"),
        ("NVDA", "英伟达"),
        ("TSLA", "特斯拉"),
        ("META", "Meta"),
    ]
}

print("=" * 50)
print("获取港股和美股数据")
print("=" * 50)

# 港股
print("\n📊 获取港股数据...")
for code, name in stocks["HK"]:
    try:
        ticker = yf.Ticker(f"{code}.HK")
        hist = ticker.history(period="5d")
        
        if hist.empty:
            print(f"❌ {code} 无数据")
            continue
            
        latest = hist.iloc[-1]
        
        result = {
            "code": code,
            "name": name,
            "market": "HK",
            "last_updated": "2026-03-25",
            "quote": {
                "close": round(latest["Close"], 2),
                "change_pct": round(((latest["Close"] - latest["Open"]) / latest["Open"]) * 100, 2),
                "volume": int(latest["Volume"]),
            },
            "valuation": {"pe": None, "pb": None, "ps": None},
            "profitability": {"roe": None, "gross_margin": None},
            "dividend": {"yield": None, "payout_ratio": None},
            "growth": {},
        }
        
        with open(f"data/fundamental/{code}_financial.json", "w") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"✅ {code} {name}: 收盘价={latest['Close']}")
        time.sleep(2)  # 避免限流
        
    except Exception as e:
        print(f"❌ {code} {name}: {e}")

# 美股
print("\n📊 获取美股数据...")
for code, name in stocks["US"]:
    try:
        ticker = yf.Ticker(code)
        hist = ticker.history(period="5d")
        
        if hist.empty:
            print(f"❌ {code} 无数据")
            continue
            
        latest = hist.iloc[-1]
        
        result = {
            "code": code,
            "name": name,
            "market": "US",
            "last_updated": "2026-03-25",
            "quote": {
                "close": round(latest["Close"], 2),
                "change_pct": round(((latest["Close"] - latest["Open"]) / latest["Open"]) * 100, 2),
                "volume": int(latest["Volume"]),
            },
            "valuation": {"pe": None, "pb": None, "ps": None},
            "profitability": {"roe": None, "gross_margin": None},
            "dividend": {"yield": None, "payout_ratio": None},
            "growth": {},
        }
        
        with open(f"data/fundamental/{code}_financial.json", "w") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"✅ {code} {name}: 收盘价=${latest['Close']}")
        time.sleep(2)
        
    except Exception as e:
        print(f"❌ {code} {name}: {e}")

print("\n" + "=" * 50)
print("✅ 数据获取完成!")
print("=" * 50)