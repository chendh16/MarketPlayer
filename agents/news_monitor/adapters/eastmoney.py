"""
EastMoneyAdapter - 东方财富数据源适配器
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from ..service_client import RequestOptions, service_client


@dataclass
class EastMoneyNewsItem:
    """东方财富新闻项"""
    title: str
    content: str
    source: str
    url: str
    published_at: datetime
    category: str
    sentiment: str


class EastMoneyAdapter:
    """东方财富数据源适配器"""
    
    BASE_URL = "https://newsapi.eastmoney.com"
    
    def __init__(self, client=None):
        self.client = client or service_client

    async def fetch_news(
        self, 
        categories: Optional[list[str]] = None,
        limit: int = 20,
    ) -> list[EastMoneyNewsItem]:
        """获取东方财富新闻"""
        categories = categories or ["bankuai"]
        news_items = []
        
        for category in categories:
            items = await self._fetch_category_news(category, limit)
            news_items.extend(items)
        
        news_items.sort(key=lambda x: x.published_at or datetime.min, reverse=True)
        return news_items[:limit]

    async def _fetch_category_news(self, category: str, limit: int) -> list[EastMoneyNewsItem]:
        """获取分类新闻"""
        url = f"{self.BASE_URL}/kuaixun/v1/getlist_{category}_102.html"
        options = RequestOptions(
            params={"page": 1, "size": limit},
            use_cache=True,
            cache_ttl=300,
        )

        try:
            result = await self.client.request(url, options, "eastmoney")
            if isinstance(result.data, dict):
                live_list = result.data.get("LivesList", result.data.get("Data", []))
                return [self._parse_item(item, category) for item in live_list]
        except Exception:
            pass
        return []

    def _parse_item(self, data: dict, category: str) -> EastMoneyNewsItem:
        """解析新闻项"""
        published_at = datetime.now()
        if "showtime" in data:
            try:
                published_at = datetime.strptime(data["showtime"], "%Y-%m-%d %H:%M:%S")
            except Exception:
                pass

        return EastMoneyNewsItem(
            title=data.get("title", data.get("Title", "")),
            content=data.get("content", data.get("digest", "")),
            source="东方财富",
            url=data.get("url", ""),
            published_at=published_at,
            category=category,
            sentiment="neutral",
        )


eastmoney_adapter = EastMoneyAdapter()