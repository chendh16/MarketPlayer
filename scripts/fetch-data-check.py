#!/usr/bin/env python3
"""
数据获取脚本 - 带重试和限流处理
目标: 港股20只 + A股20只
"""

import time
import json
import os
import requests

DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines'

# 港股20只
HK_STOCKS = [
    ('00700', '腾讯'), ('09988', '阿里'), ('03690', '美团'), ('01810', '小米'),
    ('02318', '平安'), ('02628', '中国人寿'), ('00939', '建设银行'), ('01093', '石药'),
    ('00175', '汇丰'), ('02269', '联想'), ('00883', '中海油'), ('00981', '中芯'),
    ('03888', '金山'), ('06618', '京东健康'), ('09618', '京东'), ('09888', '百度'),
    ('09999', '网易'), ('02018', '阿里健康'), ('01313', '华润置地'), ('03333', '中国铁建'),
]

# A股20只
A_STOCKS = [
    ('600519', '茅台'), ('000858', '五粮液'), ('600036', '招商银行'), ('000001', '平安银行'),
    ('300750', '宁德时代'), ('601318', '中国平安'), ('600900', '长江电力'), ('000333', '美的集团'),
    ('000651', '格力电器'), ('600276', '恒瑞医药'), ('002594', '比亚迪'), ('600030', '中信证券'),
    ('601888', '中国中免'), ('600028', '中国石化'), ('601398', '工商银行'), ('601988', '中国银行'),
    ('600016', '民生银行'), ('600309', '万华化学'), ('002475', '立讯精密'), ('300059', '东方财富'),
]

def fetch_with_retry(url, retries=3, delay=5):
    """带重试的请求"""
    for i in range(retries):
        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code == 200:
                return resp
            print(f"  状态码: {resp.status_code}, 重试 {i+1}/{retries}")
        except Exception as e:
            print(f"  错误: {str(e)[:30]}, 重试 {i+1}/{retries}")
        time.sleep(delay)
    return None

# 使用本地Stooq数据
def get_hk_from_local():
    """从本地已有的港股数据获取"""
    existing = []
    for f in os.listdir(DATA_DIR):
        if f.startswith('hk_'):
            symbol = f.replace('hk_', '').replace('.json', '')
            existing.append(symbol)
    return existing

# 尝试通过Tushare获取A股(如果有token)
def get_a_share_token():
    """检查是否有Tushare token"""
    token = os.environ.get('TUSHARE_TOKEN', '')
    return token

print("=== 数据获取脚本 ===")
print(f"港股目标: {len(HK_STOCKS)}只")
print(f"A股目标: {len(A_STOCKS)}只")
print("")

# 检查现有数据
existing_hk = get_hk_from_local()
print(f"现有港股数据: {len(existing_hk)}只")
print(f"现有: {', '.join(existing_hk[:10])}...")

# 检查Tushare
tushare_token = get_a_share_token()
if tushare_token:
    print("✓ Tushare token已配置")
else:
    print("⚠️ Tushare token未配置，需要从 https://tushare.pro 注册获取")

print("")
print("解决方案:")
print("1. 港股: 已有10只，可尝试每天获取增量数据")
print("2. A股: 需要配置Tushare token")
print("3. 财经新闻: 已有Finnhub/东方财富源")
print("4. 基本面: 需要Tushare或付费API")
