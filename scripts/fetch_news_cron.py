#!/usr/bin/env python3
"""
定时新闻抓取脚本
用于 crontab: */5 * * * * cd /path/to/MarketPlayer && python3 scripts/fetch_news_cron.py
"""

import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def fetch_news(url: str = "http://localhost:8000"):
    """执行新闻抓取"""
    try:
        import httpx
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            print(f"📥 Posting to {url}/api/news/fetch...")
            
            response = await client.post(
                f"{url}/api/news/fetch",
                json={"limit": 20}
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ {data.get('summary', 'Success')}")
                print(f"  Sources: {data.get('sources', {})}")
                return data
            else:
                print(f"❌ Error {response.status_code}: {response.text}")
                return None
                
    except ImportError:
        # 降级使用 urllib
        import urllib.request
        import urllib.parse
        
        data = {"limit": 20}
        json_data = urllib.parse.urlencode(data).encode()
        
        req = urllib.request.Request(
            f"{url}/api/news/fetch",
            data=json_data,
            headers={"Content-Type": "application/json"}
        )
        
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                result = response.read().decode()
                print(f"✅ {result}")
                return result
        except Exception as e:
            print(f"❌ Error: {e}")
            return None


async def main():
    """主函数"""
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    
    print(f"🗞️  News Fetcher - {url}")
    print("-" * 40)
    
    result = await fetch_news(url)
    
    if result:
        print("\n✅ Fetch completed successfully")
        return 0
    else:
        print("\n❌ Fetch failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)