"""
XueqiuAdapter - 雪球数据源适配器
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from ..service_client import RequestOptions, service_client


@dataclass
class XueqiuNewsItem:
    """雪球新闻项"""
    title: str
    content: str
    source: str
    url: str
    published_at: datetime
    symbols: list[str]
    category: str
    sentiment: str


class XueqiuAdapter:
    """雪球数据源适配器"""
    
    BASE_URL = "https://xueqiu.com"
    
    def __init__(self, client=None):
        self.client = client or service_client

    async def fetch_news(
        self, 
        symbols: Optional[list[str]] = None,
        limit: int = 20,
    ) -> list[XueqiuNewsItem]:
        """获取雪球新闻"""
        news_items = []
        
        for symbol in (symbols or []):
            items = await self._fetch_stock_news(symbol, limit)
            news_items.extend(items)
            await asyncio.sleep(0.5)
        
        return news_items[:limit]

    async def _fetch_stock_news(self, symbol: str, limit: int) -> list[XueqiuNewsItem]:
        """获取单个股票新闻"""
        url = f"{self.BASE_URL}/statuses/search.json"
        options = RequestOptions(
            params={"symbol": symbol, "size": limit},
            use_cache=True,
            cache_ttl=300,
        )

        try:
            result = await self.client.request(url, options, "xueqiu")
            if isinstance(result.data, dict) and "statuses" in result.data:
                return [self._parse_item(s) for s in result.data["statuses"]]
        except Exception:
            pass
        return []

    def _parse_item(self, data: dict) -> XueqiuNewsItem:
        """解析新闻项"""
        return XueqiuNewsItem(
            title=data.get("title", ""),
            content=data.get("text", ""),
            source="雪球",
            url=f"{self.BASE_URL}/statuses/{data.get('id', '')}",
            published_at=datetime.now(),
            symbols=[s.get("symbol", "") for s in data.get("symbols", [])],
            category=data.get("type", "news"),
            sentiment="neutral",
        )


xueqiu_adapter = XueqiuAdapter()