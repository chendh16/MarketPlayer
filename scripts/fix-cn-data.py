#!/usr/bin/env python3
"""获取A股财务数据 - 修复版"""
import requests
import json

stocks = [
    ("600519", "贵州茅台"),
    ("000858", "五粮液"),
    ("300750", "宁德时代"),
    ("601318", "中国平安"),
    ("000333", "美的集团"),
]

for code, name in stocks:
    market = "1" if code.startswith("6") else "0"
    url = f"https://push2.eastmoney.com/api/qt/stock/get?secid={market}.{code}&fields=f43,f57,f58,f162,f164,f167,f169,f170,f171,f173,f177"
    
    try:
        r = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        d = r.json().get("data", {})
        
        if not d:
            continue
        
        # 直接取值
        f43 = d.get("f43") or 0
        f162 = d.get("f162") or 0
        f164 = d.get("f164") or 0
        f167 = d.get("f167") or 0
        f169 = d.get("f169") or 0
        f170 = d.get("f170") or 0
        f171 = d.get("f171") or 0
        f173 = d.get("f173") or 0
        f177 = d.get("f177")
        
        result = {
            "code": code,
            "name": name,
            "market": "CN",
            "last_updated": "2026-03-25",
            "quote": {
                "close": round(f43 / 100, 2),
                "change_pct": round(f169 / 100, 2),
                "volume": f177,
            },
            "valuation": {
                "pe": round(f162 / 100, 2) if f162 > 0 else None,
                "pb": round(f167 / 100, 2) if f167 > 0 else None,
                "ps": round(f164 / 100, 2) if f164 > 0 else None,
            },
            "profitability": {
                "roe": round(f173, 2) if f173 else None,
                "gross_margin": round(f170 / 10, 2) if f170 else None,
                "net_margin": round(f171 / 10, 2) if f171 else None,
            },
            "dividend": {"yield": None, "payout_ratio": None},
            "growth": {},
        }
        
        with open(f"data/fundamental/{code}_financial.json", "w") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"✅ {code} {name}: PE={result['valuation']['pe']}, PB={result['valuation']['pb']}, ROE={result['profitability']['roe']}")
        
    except Exception as e:
        print(f"❌ {code} {name}: {e}")

print("\n完成!")