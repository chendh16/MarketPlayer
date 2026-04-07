"""
GDELTAdapter - GDELT 数据源适配器

GDELT API:
- https://api.gdeltproject.org/api/v2/doc/doc
- timespan=7d, maxrecords=20, format=json, sort=date
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import re

from ..service_client import RequestOptions, service_client


@dataclass
class GDELTNewsItem:
    """GDELT 新闻项"""
    title: str
    content: str
    source: str
    url: str
    published_at: Optional[datetime]
    language: str
    domain: str
    sentiment: str = "neutral"


CATEGORY_QUERIES: dict[str, str] = {
    "politics": "politics government election congress",
    "tech": "technology AI artificial intelligence",
    "finance": "finance economy market stock",
    "gov": "government policy regulation",
    "ai": "artificial intelligence machine learning",
    "intel": "intelligence military security",
}


class GDELTAdapter:
    """GDELT 数据源适配器"""
    
    BASE_URL = "https://api.gdeltproject.org"
    DOC_API = "/api/v2/doc/doc"
    
    def __init__(self, client=None):
        self.client = client or service_client

    async def fetch_news(
        self,
        query: Optional[str] = None,
        categories: Optional[list[str]] = None,
        max_records: int = 20,
        timespan: str = "7d",
    ) -> list[GDELTNewsItem]:
        """获取 GDELT 新闻"""
        news_items = []
        
        if query:
            items = await self._search_news(query, max_records, timespan)
            news_items.extend(items)
        
        for category in (categories or []):
            category_query = CATEGORY_QUERIES.get(category, category)
            items = await self._search_news(category_query, max_records // 2, timespan)
            news_items.extend(items)
            await asyncio.sleep(0.3)
        
        # 去重
        seen_urls = set()
        unique_items = []
        for item in news_items:
            if item.url not in seen_urls:
                seen_urls.add(item.url)
                unique_items.append(item)
        
        unique_items.sort(key=lambda x: x.published_at or datetime.min, reverse=True)
        return unique_items[:max_records]

    async def _search_news(
        self,
        query: str,
        max_records: int = 20,
        timespan: str = "7d",
    ) -> list[GDELTNewsItem]:
        """搜索新闻"""
        options = RequestOptions(
            params={
                "query": query,
                "maxrecords": max_records,
                "timespan": timespan,
                "sort": "date",
                "format": "json",
                "mode": "artlist",
            },
            use_cache=True,
            cache_ttl=300,
            timeout=15.0,
        )

        try:
            result = await self.client.request(self.BASE_URL + self.DOC_API, options, "gdelt")
            if isinstance(result.data, dict):
                articles = result.data.get("articles", [])
                return [self._parse_article(a) for a in articles]
        except Exception:
            pass
        return []

    def _parse_article(self, article: dict) -> GDELTNewsItem:
        """解析文章"""
        published_at = None
        if "seendate" in article:
            try:
                published_at = datetime.fromisoformat(
                    article["seendate"].replace("Z", "+00:00")
                )
            except Exception:
                pass

        return GDELTNewsItem(
            title=article.get("title", ""),
            content=article.get("text", ""),
            source=article.get("domain", ""),
            url=article.get("url", ""),
            published_at=published_at,
            language=article.get("language", "en"),
            domain=article.get("domain", ""),
        )

    async def fetch_rss_feeds(
        self,
        sources: Optional[list[str]] = None,
        limit: int = 20,
    ) -> list[GDELTNewsItem]:
        """获取 RSS feeds"""
        default_sources = [
            "http://feeds.bbci.co.uk/news/rss.xml",
            "https://www.npr.org/rss/rss.php",
        ]
        sources = sources or default_sources
        
        news_items = []
        for source_url in sources[:10]:
            try:
                items = await self._fetch_rss_feed(source_url, limit // len(sources))
                news_items.extend(items)
                await asyncio.sleep(0.3)
            except Exception:
                pass
        
        return news_items[:limit]

    async def _fetch_rss_feed(self, url: str, limit: int) -> list[GDELTNewsItem]:
        """获取单个 RSS feed"""
        proxy_url = f"https://api.allorigins.win/raw?url={url}"
        
        options = RequestOptions(
            use_cache=True,
            cache_ttl=600,
            timeout=10.0,
            response_type="text",
        )

        try:
            result = await self.client.request(proxy_url, options, "rss")
            if isinstance(result.data, str):
                return self._parse_rss(result.data, url)[:limit]
        except Exception:
            pass
        return []

    def _parse_rss(self, xml_content: str, source_url: str) -> list[GDELTNewsItem]:
        """简单 RSS 解析"""
        items = []
        
        item_pattern = re.compile(r"<item>(.*?)</item>", re.DOTALL)
        title_pattern = re.compile(r"<title><!\[CDATA\[(.*?)\]\]></title>|<title>(.*?)</title>")
        link_pattern = re.compile(r"<link>(.*?)</link>")
        
        for match in item_pattern.finditer(xml_content)[:20]:
            item_text = match.group(1)
            
            title_match = title_pattern.search(item_text)
            title = title_match.group(1) or title_match.group(2) or "" if title_match else ""
            
            link_match = link_pattern.search(item_text)
            link = link_match.group(1).strip() if link_match else ""
            
            if title:
                items.append(GDELTNewsItem(
                    title=title.strip(),
                    content="",
                    source=source_url,
                    url=link,
                    published_at=None,
                    language="en",
                    domain=source_url,
                ))
        
        return items


gdelt_adapter = GDELTAdapter()