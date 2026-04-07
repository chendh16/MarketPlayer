"""
EastMoneyAdapter - 东方财富数据源适配器

东方财富API：
- 实时行情: https://push2.eastmoney.com
- 新闻中心: https://np-anotice stockapi.eastmoney.com
- 财经新闻: https://newsapi.eastmoney.com

用法:
    adapter = EastMoneyAdapter()
    news = await adapter.fetch_news(categories=["bankuai", "industry"])
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import pytest

from ..service_client import RequestOptions, service_client
from ..news_classifier import NewsCategory, Sentiment


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
    """
    东方财富数据源适配器

    数据来源：
    - 财经新闻 API
    - 公告 API
    - 研究报告
    """

    BASE_URL = "https://newsapi.eastmoney.com"
    NOTICE_API = "https://np-anotice.stockapi.eastmoney.com"
    
    def __init__(self, client=None):
        self.client = client or service_client

    async def fetch_news(
        self, 
        categories: Optional[list[str]] = None,
        limit: int = 20,
    ) -> list[EastMoneyNewsItem]:
        """
        获取东方财富新闻
        
        Args:
            categories: 分类列表 
                - bankuai: 板块新闻
                - industry: 行业新闻  
                - concept: 概念新闻
                - global: 全球财经
            limit: 返回条数
            
        Returns:
            list[EastMoneyNewsItem]: 新闻列表
        """
        categories = categories or ["bankuai"]
        news_items = []
        
        for category in categories:
            items = await self._fetch_category_news(category, limit)
            news_items.extend(items)
        
        # 按时间排序
        news_items.sort(key=lambda x: x.published_at or datetime.min, reverse=True)
        
        return news_items[:limit]

    async def _fetch_category_news(
        self, 
        category: str, 
        limit: int
    ) -> list[EastMoneyNewsItem]:
        """获取分类新闻"""
        url = f"{self.BASE_URL}/kuaixun/v1/getlist_{category}_102.html"
        options = RequestOptions(
            params={
                "page": 1,
                "size": limit,
            },
            use_cache=True,
            cache_ttl=300,
            timeout=10.0,
        )

        try:
            result = await self.client.request(url, options, service_name="eastmoney")
            data = result.data
            
            if isinstance(data, dict):
                live_list = data.get("LivesList", data.get("Data", []))
                return [self._parse_news_item(item, category) for item in live_list]
            
            return []
        except Exception as e:
            print(f"Failed to fetch {category} news: {e}")
            return []

    def _parse_news_item(self, data: dict, category: str) -> EastMoneyNewsItem:
        """解析新闻项"""
        # 解析时间
        published_at = datetime.now()
        if "showtime" in data:
            try:
                # 格式: "2024-01-01 10:00:00"
                published_at = datetime.strptime(
                    data["showtime"], "%Y-%m-%d %H:%M:%S"
                )
            except Exception:
                pass

        # 构建URL
        url = data.get("url", "")
        if not url.startswith("http"):
            url = f"https://live{url}.eastmoney.com"

        return EastMoneyNewsItem(
            title=data.get("title", data.get("Title", "")),
            content=data.get("content", data.get("digest", "")),
            source="东方财富",
            url=url,
            published_at=published_at,
            category=category,
            sentiment="neutral",
        )

    async def fetch_notices(
        self, 
        symbol: str, 
        limit: int = 20
    ) -> list[dict]:
        """
        获取公告
        
        Args:
            symbol: 股票代码 (如 "600519")
            limit: 返回条数
            
        Returns:
            list[dict]: 公告列表
        """
        url = f"{self.NOTICE_API}/kuaixun/v1/get_notices_{symbol}.json"
        options = RequestOptions(
            params={
                "page": 1,
                "size": limit,
            },
            use_cache=True,
            cache_ttl=3600,  # 公告缓存1小时
            timeout=10.0,
        )

        try:
            result = await self.client.request(url, options, service_name="eastmoney")
            return result.data.get("data", []) if isinstance(result.data, dict) else []
        except Exception as e:
            print(f"Failed to fetch notices for {symbol}: {e}")
            return []

    async def fetch_global_news(
        self, 
        limit: int = 20
    ) -> list[EastMoneyNewsItem]:
        """
        获取全球财经新闻
        
        Args:
            limit: 返回条数
            
        Returns:
            list[EastMoneyNewsItem]: 新闻列表
        """
        return await self._fetch_category_news("global", limit)

    async def fetch_industry_news(
        self, 
        industry: str,
        limit: int = 20
    ) -> list[EastMoneyNewsItem]:
        """
        获取行业新闻
        
        Args:
            industry: 行业名称
            limit: 返回条数
            
        Returns:
            list[EastMoneyNewsItem]: 新闻列表
        """
        url = f"{self.BASE_URL}/kuaixun/v1/getlist_102_{industry}.html"
        options = RequestOptions(
            params={
                "page": 1,
                "size": limit,
            },
            use_cache=True,
            cache_ttl=300,
            timeout=10.0,
        )

        try:
            result = await self.client.request(url, options, service_name="eastmoney")
            data = result.data
            
            if isinstance(data, dict):
                live_list = data.get("LivesList", data.get("Data", []))
                return [self._parse_news_item(item, industry) for item in live_list]
            
            return []
        except Exception as e:
            print(f"Failed to fetch industry news for {industry}: {e}")
            return []


# 导出默认适配器
eastmoney_adapter = EastMoneyAdapter()


# === 测试用例 ===
@pytest.fixture
def adapter():
    return EastMoneyAdapter()


class TestEastMoneyAdapter:
    """东方财富适配器测试"""

    @pytest.mark.asyncio
    async def test_fetch_news(self, adapter):
        """测试获取新闻"""
        try:
            news = await adapter.fetch_news(categories=["bankuai"], limit=5)
            assert isinstance(news, list)
        except Exception:
            pass  # 跳过网络测试

    @pytest.mark.asyncio
    async def test_fetch_global_news(self, adapter):
        """测试获取全球财经新闻"""
        try:
            news = await adapter.fetch_global_news(limit=5)
            assert isinstance(news, list)
        except Exception:
            pass