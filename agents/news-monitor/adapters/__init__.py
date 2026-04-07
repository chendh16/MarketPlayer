"""
Data Source Adapters - 数据源适配器

包含：
- XueqiuAdapter: 雪球
- EastMoneyAdapter: 东方财富
- GDELTAdapter: GDELT
"""

from .xueqiu import XueqiuAdapter, XueqiuNewsItem
from .eastmoney import EastMoneyAdapter, EastMoneyNewsItem
from .gdelt import GDELTAdapter, GDELTNewsItem, CATEGORY_QUERIES

__all__ = [
    "XueqiuAdapter",
    "XueqiuNewsItem",
    "EastMoneyAdapter", 
    "EastMoneyNewsItem",
    "GDELTAdapter",
    "GDELTNewsItem",
    "CATEGORY_QUERIES",
]