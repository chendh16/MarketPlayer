"""
CorrelationEngine - 新闻与持仓关联分析引擎
"""

from typing import List, Dict, Optional
from dataclasses import dataclass
import asyncpg


@dataclass
class CorrelationResult:
    correlation_score: float  # 0.0-1.0
    affected_symbols: List[str]
    impact_level: str  # 'high' | 'medium' | 'low'
    reasoning: str


class CorrelationEngine:
    def __init__(self, db_pool: asyncpg.Pool):
        self.db_pool = db_pool

    async def analyze(self, news_title: str, news_summary: str, symbols: List[str]) -> CorrelationResult:
        """
        分析新闻与股票的相关性
        """
        # 简化实现：基于关键词匹配
        high_impact_keywords = ['暴跌', '崩盘', '危机', 'crash', 'crisis', 'breach']
        medium_impact_keywords = ['下跌', '上涨', '增长', 'rally', 'decline', 'growth']

        text = (news_title + ' ' + (news_summary or '')).lower()

        # 计算相关性分数
        score = 0.0
        impact_level = 'low'
        reasoning = []

        for keyword in high_impact_keywords:
            if keyword in text:
                score = max(score, 0.8)
                impact_level = 'high'
                reasoning.append(f'包含高影响关键词: {keyword}')

        for keyword in medium_impact_keywords:
            if keyword in text:
                score = max(score, 0.5)
                if impact_level == 'low':
                    impact_level = 'medium'
                reasoning.append(f'包含中等影响关键词: {keyword}')

        # 如果新闻中提到了持仓股票，提高相关性
        affected_symbols = []
        if symbols:
            for symbol in symbols:
                if symbol.lower() in text or symbol.replace('.', '').lower() in text:
                    affected_symbols.append(symbol)
                    score = min(1.0, score + 0.2)
                    reasoning.append(f'提及持仓股票: {symbol}')

        if score == 0.0:
            score = 0.1  # 默认最低相关性
            reasoning.append('未发现明显相关性')

        return CorrelationResult(
            correlation_score=score,
            affected_symbols=affected_symbols,
            impact_level=impact_level,
            reasoning='; '.join(reasoning)
        )

    async def get_market_context(self, symbols: List[str]) -> Dict:
        """
        查询 market_status 表，获取当前市场状态
        """
        try:
            # 查询 market_status 表（如果存在）
            result = await self.db_pool.fetch(
                "SELECT * FROM market_status ORDER BY created_at DESC LIMIT 1"
            )
            if result:
                return dict(result[0])
            return {}
        except Exception:
            # 表可能不存在，返回空
            return {}
