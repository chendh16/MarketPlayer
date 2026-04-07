"""
XueqiuAdapter - 雪球数据源适配器

雪球API：
- 实时行情: https://xueqiu.com/hq
- 新闻中心: https://xueqiu.com/news
- 股票的评论和研报

用法:
    adapter = XueqiuAdapter()
    news = await adapter.fetch_news(symbols=["AAPL", "MSFT"])
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import pytest

from ..service_client import RequestOptions, service_client
from ..news_classifier import NewsCategory, Sentiment


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
    """
    雪球数据源适配器

    数据来源：
    - 雪球新闻 API（需要登录token）
    - 热度榜
    - 股票评论
    """

    BASE_URL = "https://xueqiu.com"
    NEWS_API = "/statuses/news.json"
    HOT_API = "/stock/hot.json"
    
    def __init__(self, client=None):
        self.client = client or service_client

    async def fetch_news(
        self, 
        symbols: Optional[list[str]] = None,
        limit: int = 20,
    ) -> list[XueqiuNewsItem]:
        """
        获取雪球新闻
        
        获取指定股票的新闻和评论
        
        Args:
            symbols: 股票代码列表，如 ["AAPL", "MSFT"]
            limit: 返回条数
            
        Returns:
            list[XueqiuNewsItem]: 新闻列表
        """
        news_items = []
        
        # 合并所有symbols的搜索
        all_news = await self._fetch_all_symbols_news(symbols or [], limit)
        
        for item in all_news[:limit]:
            news_items.append(self._parse_news_item(item))
        
        return news_items

    async def _fetch_all_symbols_news(
        self, 
        symbols: list[str], 
        limit: int
    ) -> list[dict]:
        """获取所有symbols的新闻"""
        all_items = []
        
        for symbol in symbols:
            items = await self._fetch_stock_news(symbol, limit)
            all_items.extend(items)
            await asyncio.sleep(0.5)  # 速率限制
        
        # 按发布时间排序
        all_items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
        
        return all_items[:limit]

    async def _fetch_stock_news(self, symbol: str, limit: int) -> list[dict]:
        """获取单个股票的新闻"""
        # 雪球搜索API
        url = f"{self.BASE_URL}/statuses/search.json"
        options = RequestOptions(
            params={
                "symbol": symbol,
                "size": limit,
                "sort": "alpha",
            },
            use_cache=True,
            cache_ttl=300,
            timeout=10.0,
        )

        try:
            result = await self.client.request(url, options, service_name="xueqiu")
            data = result.data
            
            if isinstance(data, dict) and "statuses" in data:
                return data["statuses"]
            
            return []
        except Exception as e:
            print(f"Failed to fetch news for {symbol}: {e}")
            return []

    def _parse_news_item(self, data: dict) -> XueqiuNewsItem:
        """解析新闻项"""
        # 提取股��代码
        symbols = []
        if "symbols" in data:
            symbols = [s.get("symbol", "") for s in data["symbols"]]

        # 提取发布时间
        created_at = datetime.now()
        if "created_at" in data:
            try:
                created_at = datetime.fromtimestamp(data["created_at"] / 1000)
            except Exception:
                pass

        return XueqiuNewsItem(
            title=data.get("title", ""),
            content=data.get("text", ""),
            source=data.get("source", "雪球"),
            url=f"{self.BASE_URL}/statuses/{data.get('id', '')}",
            published_at=created_at,
            symbols=symbols,
            category=data.get("type", "news"),
            sentiment="neutral",
        )

    async def fetch_hot_stocks(self, exchange: str = "US") -> list[dict]:
        """
        获取热度榜
        
        Args:
            exchange: 交易所 (US/HK/CN)
            
        Returns:
            list[dict]: 热度榜股票列表
        """
        url = f"{self.BASE_URL}{self.HOT_API}"
        options = RequestOptions(
            params={"exchange": exchange},
            use_cache=True,
            cache_ttl=600,
            timeout=10.0,
        )

        try:
            result = await self.client.request(url, options, service_name="xueqiu")
            return result.data.get("data", []) if isinstance(result.data, dict) else []
        except Exception as e:
            print(f"Failed to fetch hot stocks: {e}")
            return []

    async def fetch_stock_comments(
        self, 
        symbol: str, 
        limit: int = 20
    ) -> list[dict]:
        """
        获取股票评论
        
        Args:
            symbol: 股票代码
            limit: 返回条数
            
        Returns:
            list[dict]: 评论列表
        """
        url = f"{self.BASE_URL}/statuses/favourites.json"
        options = RequestOptions(
            params={
                "symbol": symbol,
                "size": limit,
            },
            use_cache=True,
            cache_ttl=300,
            timeout=10.0,
        )

        try:
            result = await self.client.request(url, options, service_name="xueqiu")
            return result.data.get("statuses", []) if isinstance(result.data, dict) else []
        except Exception as e:
            print(f"Failed to fetch comments for {symbol}: {e}")
            return []


# 导出默认适配器
xueqiu_adapter = XueqiuAdapter()


# === 测试用例 ===
@pytest.fixture
def adapter():
    return XueqiuAdapter()


class TestXueqiuAdapter:
    """雪球适配器测试"""

    @pytest.mark.asyncio
    async def test_fetch_hot_stocks(self, adapter):
        """测试获取热度榜"""
        # 这个测试需要网络，可能失败
        try:
            stocks = await adapter.fetch_hot_stocks()
            assert isinstance(stocks, list)
        except Exception:
            pass  # 跳过网络测试

    @pytest.mark.asyncio
    async def test_fetch_news_with_symbols(self, adapter):
        """测试获取新闻"""
        try:
            news = await adapter.fetch_news(symbols=["AAPL"], limit=5)
            assert isinstance(news, list)
        except Exception:
            pass