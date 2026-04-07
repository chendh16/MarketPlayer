#!/usr/bin/env python3
"""
获取港股K线数据 - 使用腾讯财经API
"""

import requests
import json
import time
import os
from datetime import datetime, timedelta

DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines'

# 港股目标列表
HK_TARGETS = [
    '03968', '00914', '00941', '01299', '02318', '02628', '01398', '00388', '00883', '01113',
    '00001', '00017', '00016', '02120', '09618', '09888', '09955', '06381', '01928', '01169',
    '02569', '02285', '01093', '06186', '02272', '06808'
]

def get_hk_realtime(code):
    """获取实时行情"""
    url = f'https://qt.gtimg.cn/q=hk{code}'
    try:
        resp = requests.get(url, timeout=10)
        text = resp.content.decode('gbk', errors='ignore')
        return text
    except Exception as e:
        print(f'Error {code}: {e}')
        return None

def parse_hk_data(code, text):
    """解析港股数据"""
    try:
        import re
        match = re.search(rf'v_hk\d+="([^"]+)"', text)
        if not match:
            return None
        
        fields = match.group(1).split('~')
        
        return {
            'symbol': code,
            'market': 'hk',
            'name': fields[1],
            'price': float(fields[3]) if fields[3] else None,
            'change': float(fields[31]) if fields[31] else None,
            'change_pct': float(fields[32]) if fields[32] else None,
            'volume': int(float(fields[6])) if fields[6] else 0,
            'amount': float(fields[7]) if fields[7] else 0,
            'pe': float(fields[39]) if fields[39] and fields[39] != '0' else None,
            'market_cap': float(fields[37]) if fields[37] else None,
            'updated_at': datetime.now().isoformat()
        }
    except Exception as e:
        print(f'Parse error {code}: {e}')
        return None

def main():
    print("=" * 50)
    print("港股数据获取 (腾讯财经API)")
    print("=" * 50)
    
    results = []
    success = 0
    
    for i, code in enumerate(HK_TARGETS):
        print(f"[{i+1}/{len(HK_TARGETS)}] hk{code}...", end=' ')
        
        text = get_hk_realtime(code)
        if text and 'v_hk' in text:
            data = parse_hk_data(code, text)
            if data:
                # 保存实时数据
                filepath = os.path.join(DATA_DIR, f'hk_{code}.json')
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"✅ P={data.get('price')} C={data.get('change_pct')}%")
                success += 1
            else:
                print("❌ 解析失败")
        else:
            print("❌ 无数据")
        
        time.sleep(1)  # 避免限流
    
    print(f"\n完成: {success}/{len(HK_TARGETS)} 成功")
    
    # 统计
    hk_files = len([f for f in os.listdir(DATA_DIR) if f.startswith('hk_')])
    print(f"\n港股总计: {hk_files} 只")

if __name__ == '__main__':
    main()