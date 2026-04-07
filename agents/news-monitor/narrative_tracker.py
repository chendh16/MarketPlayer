"""
NarrativeTracker - 叙事追踪器
"""

from typing import List, Dict
from dataclasses import dataclass
import hashlib


@dataclass
class NarrativeResult:
    narrative_id: str
    propagation_stage: str  # 'fringe' | 'emerging' | 'mainstream'
    related_news: List[str]
    disinformation_score: float  # 0.0-1.0


class NarrativeTracker:
    def __init__(self):
        self.narratives: Dict[str, List[str]] = {}

    async def track(self, news_id: str, title: str, source: str) -> NarrativeResult:
        """
        追踪叙事传播路径
        """
        # 简化实现：基于标题关键词生成叙事ID
        keywords = self._extract_keywords(title)
        narrative_id = self._generate_narrative_id(keywords)

        # 记录到叙事库
        if narrative_id not in self.narratives:
            self.narratives[narrative_id] = []
        self.narratives[narrative_id].append(news_id)

        # 判断传播阶段
        count = len(self.narratives[narrative_id])
        if count >= 5:
            stage = 'mainstream'
        elif count >= 2:
            stage = 'emerging'
        else:
            stage = 'fringe'

        # 虚假信息分数（简化：基于来源可信度）
        trusted_sources = ['reuters', 'bloomberg', 'wsj', 'financial_times']
        disinformation_score = 0.0 if source.lower() in trusted_sources else 0.3

        return NarrativeResult(
            narrative_id=narrative_id,
            propagation_stage=stage,
            related_news=self.narratives[narrative_id],
            disinformation_score=disinformation_score
        )

    def _extract_keywords(self, title: str) -> List[str]:
        """提取关键词"""
        # 简化：分词并过滤停用词
        words = title.lower().split()
        stopwords = {'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or'}
        return [w for w in words if w not in stopwords and len(w) > 3][:5]

    def _generate_narrative_id(self, keywords: List[str]) -> str:
        """生成叙事ID"""
        key = '_'.join(sorted(keywords))
        return hashlib.md5(key.encode()).hexdigest()[:12]
