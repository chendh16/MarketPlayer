"""
News Monitor - MarketPlayer 后端新闻服务模块

包含：
- ServiceClient: 统一 HTTP 客户端（缓存/重试/熔断）
- NewsClassifier: 新闻分类器（规则引擎）
- 数据源适配器：雪球/东方财富/GDELT
"""

__version__ = "0.1.0"

from .service_client import ServiceClient, CircuitBreaker, CacheManager
from .news_classifier import NewsClassifier, NewsCategory
from .adapters.xueqiu import XueqiuAdapter
from .adapters.eastmoney import EastMoneyAdapter
from .adapters.gdelt import GDELTAdapter

__all__ = [
    "ServiceClient",
    "CircuitBreaker",
    "CacheManager",
    "NewsClassifier",
    "NewsCategory",
    "XueqiuAdapter",
    "EastMoneyAdapter",
    "GDELTAdapter",
]