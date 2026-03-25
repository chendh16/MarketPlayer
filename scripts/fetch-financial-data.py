#!/usr/bin/env python3
"""
长线Agent财务数据获取脚本
获取A股、港股、美股的财务指标
"""

import os
import json
import time
import datetime
from datetime import datetime

# 导入数据源库
import akshare as ak
import yfinance as yf

# 确保数据目录存在
DATA_DIR = "data/fundamental"
ERROR_LOG = "data/logs/fetch_errors.log"

# 股票列表配置
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
        {"code": "09999", "name": "网易-S"},
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
    """记录错误到日志"""
    os.makedirs("data/logs", exist_ok=True)
    with open(ERROR_LOG, "a") as f:
        f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | {market}.{code} | {error_msg}\n")

def fetch_cn_financial(code, name):
    """获取A股财务数据"""
    try:
        # 使用AKShare获取个股指标
        df = ak.stock_a_indicator_lg(symbol=code)
        
        if df is None or df.empty:
            log_error(code, "CN", "AKShare返回空数据")
            return None
        
        # 获取最新数据
        latest = df.iloc[-1]
        
        data = {
            "code": code,
            "name": name,
            "market": "CN",
            "last_updated": datetime.now().strftime("%Y-%m-%d"),
            "valuation": {
                "pe": float(latest.get("pe", None)) if pd.notna(latest.get("pe")) else None,
                "pb": float(latest.get("pb", None)) if pd.notna(latest.get("pb")) else None,
                "ps": float(latest.get("ps", None)) if pd.notna(latest.get("ps")) else None,
            },
            "profitability": {
                "roe": float(latest.get("roe", None)) if pd.notna(latest.get("roe")) else None,
                "gross_margin": None,
                "net_profit_growth_3y": None,
                "revenue_growth_3y": None,
            },
            "dividend": {
                "yield": float(latest.get("dv_ratio", None)) / 100 if pd.notna(latest.get("dv_ratio")) else None,
                "payout_ratio": float(latest.get("dv_ttm", None)) if pd.notna(latest.get("dv_ttm")) else None,
                "consecutive_years": None,
            },
            "growth": {
                "rd_ratio": None,
                "revenue_cagr_3y": None,
            }
        }
        
        print(f"✅ {code} {name} A股数据获取成功")
        return data
        
    except Exception as e:
        log_error(code, "CN", str(e))
        print(f"❌ {code} A股数据获取失败: {e}")
        return None

def fetch_hk_financial(code, name):
    """获取港股财务数据"""
    try:
        # Yahoo Finance港股代码格式
        yf_code = f"{code}.HK"
        stock = yf.Ticker(yf_code)
        
        # 获取info数据
        info = stock.info
        
        data = {
            "code": code,
            "name": name,
            "market": "HK",
            "last_updated": datetime.now().strftime("%Y-%m-%d"),
            "valuation": {
                "pe": info.get("trailingPE"),
                "pb": info.get("priceToBook"),
                "ps": info.get("priceToSalesTrailing12Months"),
            },
            "profitability": {
                "roe": info.get("returnOnEquity"),
                "gross_margin": info.get("grossMargins"),
                "net_profit_growth_3y": info.get("netIncomeToCommon", {}).get("3y", None) if isinstance(info.get("netIncomeToCommon"), dict) else None,
                "revenue_growth_3y": info.get("revenueGrowth"),
            },
            "dividend": {
                "yield": info.get("dividendYield"),
                "payout_ratio": info.get("payoutRatio"),
                "consecutive_years": None,
            },
            "growth": {
                "rd_ratio": None,
                "revenue_cagr_3y": None,
            }
        }
        
        print(f"✅ {code} {name} 港股数据获取成功")
        return data
        
    except Exception as e:
        log_error(code, "HK", str(e))
        print(f"❌ {code} 港股数据获取失败: {e}")
        return None

def fetch_us_financial(code, name):
    """获取美股财务数据"""
    try:
        stock = yf.Ticker(code)
        info = stock.info
        
        # 获取财务数据
        financials = stock.financials
        balance_sheet = stock.balance_sheet
        
        # 计算营收增速
        revenue_growth = None
        if financials is not None and not financials.empty:
            try:
                if "Total Revenue" in financials.index:
                    revenues = financials.loc["Total Revenue"]
                    if len(revenues) >= 3:
                        cagr = ((revenues.iloc[0] / revenues.iloc[2]) ** (1/2) - 1) * 100
                        revenue_growth = cagr
            except:
                pass
        
        data = {
            "code": code,
            "name": name,
            "market": "US",
            "last_updated": datetime.now().strftime("%Y-%m-%d"),
            "valuation": {
                "pe": info.get("trailingPE"),
                "pb": info.get("priceToBook"),
                "ps": info.get("priceToSalesTrailing12Months"),
            },
            "profitability": {
                "roe": info.get("returnOnEquity"),
                "gross_margin": info.get("grossMargins"),
                "net_profit_growth_3y": None,
                "revenue_growth_3y": revenue_growth,
            },
            "dividend": {
                "yield": info.get("dividendYield"),
                "payout_ratio": info.get("payoutRatio"),
                "consecutive_years": None,
            },
            "growth": {
                "rd_ratio": None,
                "revenue_cagr_3y": revenue_growth,
            }
        }
        
        print(f"✅ {code} {name} 美股数据获取成功")
        return data
        
    except Exception as e:
        log_error(code, "US", str(e))
        print(f"❌ {code} 美股数据获取失败: {e}")
        return None

def save_financial_data(data):
    """保存财务数据到文件"""
    if data is None:
        return
    
    filepath = f"{DATA_DIR}/{data['code']}_financial.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    print("=" * 50)
    print("长线Agent财务数据获取")
    print("=" * 50)
    
    # 确保目录存在
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs("data/logs", exist_ok=True)
    
    # 获取A股数据
    print("\n📊 获取A股财务数据...")
    for stock in STOCKS["CN"]:
        data = fetch_cn_financial(stock["code"], stock["name"])
        if data:
            save_financial_data(data)
        time.sleep(1)  # 避免请求过快
    
    # 获取港股数据
    print("\n📊 获取港股财务数据...")
    for stock in STOCKS["HK"]:
        data = fetch_hk_financial(stock["code"], stock["name"])
        if data:
            save_financial_data(data)
        time.sleep(1)
    
    # 获取美股数据
    print("\n📊 获取美股财务数据...")
    for stock in STOCKS["US"]:
        data = fetch_us_financial(stock["code"], stock["name"])
        if data:
            save_financial_data(data)
        time.sleep(1)
    
    print("\n" + "=" * 50)
    print("✅ 数据获取完成!")
    print("=" * 50)

if __name__ == "__main__":
    main()