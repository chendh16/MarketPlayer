"""
Correlation Engine - 分析新闻间的模式关联

功能：
- 新兴模式检测 (3+ mentions)
- 动量信号 (delta tracking)
- 跨源关联
- 预测信号
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

# Topic 配置 - 需要从 config 导入
CORRELATION_TOPICS = [
    {"id": "fed-rates", "category": "Finance", "patterns": [r"fed", r"interest rate", r"rate cut", r"inflation"]},
    {"id": "tariffs", "category": "Trade", "patterns": [r"tariff", r"trade war", r"china trade", r"tariffs"]},
    {"id": "layoffs", "category": "Economy", "patterns": [r"layoff", r"cut jobs", r"job cuts", r"unemployment"]},
    {"id": "china-russia", "category": "Geopolitics", "patterns": [r"china.*russia", r"russia.*china", r"beijing.*moscow"]},
    {"id": "ukraine", "category": "Geopolitics", "patterns": [r"ukraine", r"kiev", r"russia.*war"]},
    {"id": "taiwan", "category": "Geopolitics", "patterns": [r"taiwan", r"taiwan.*china", r"taiwan.*straits"]},
    {"id": "ai-tech", "category": "Tech", "patterns": [r"ai", r"chatgpt", r"openai", r"artificial intelligence"]},
    {"id": "semiconductors", "category": "Tech", "patterns": [r"chip", r"semiconductor", r"nvidia", r"tsmc"]},
    {"id": "crypto", "category": "Finance", "patterns": [r"bitcoin", r"btc", r"crypto", r"ethereum"]},
    {"id": "oil-prices", "category": "Commodity", "patterns": [r"oil", r"opec", r"crude"]},
]


# Types
@dataclass
class EmergingPattern:
    id: str
    name: str
    category: str
    count: int
    level: str  # high, elevated, emerging
    sources: list[str]
    headlines: list[dict]


@dataclass
class MomentumSignal:
    id: str
    name: str
    category: str
    current: int
    delta: int
    momentum: str  # surging, rising, stable
    headlines: list[dict]


@dataclass
class CrossSourceCorrelation:
    id: str
    name: str
    category: str
    source_count: int
    sources: list[str]
    level: str
    headlines: list[dict]


@dataclass
class PredictiveSignal:
    id: str
    name: str
    category: str
    score: int
    confidence: int
    prediction: str
    level: str
    headlines: list[dict]


@dataclass
class CorrelationResults:
    emerging_patterns: list[EmergingPattern] = field(default_factory=list)
    momentum_signals: list[MomentumSignal] = field(default_factory=list)
    cross_source_correlations: list[CrossSourceCorrelation] = field(default_factory=list)
    predictive_signals: list[PredictiveSignal] = field(default_factory=list)


# History storage
topic_history: dict[int, dict[str, int]] = {}
HISTORY_RETENTION_MINUTES = 30
MOMENTUM_WINDOW_MINUTES = 10


def _format_topic_name(topic_id: str) -> str:
    """格式化主题名称"""
    return topic_id.replace("-", " ").title()


def _get_topic_patterns(topic_id: str) -> list:
    """获取主题的正则表达式"""
    for topic in CORRELATION_TOPICS:
        if topic["id"] == topic_id:
            return [re.compile(p, re.IGNORECASE) for p in topic["patterns"]]
    return []


def analyze_correlations(news_items: list[dict]) -> Optional[CorrelationResults]:
    """
    分析所有新闻的关联
    
    Args:
        news_items: 新闻列表 [{"title": str, "source": str, "url": str}, ...]
    
    Returns:
        CorrelationResults 或 None
    """
    if not news_items:
        return None
    
    now = datetime.now()
    current_minute = int(now.timestamp() / 60)
    
    results = CorrelationResults()
    
    # 统计主题和来源
    topic_counts: dict[str, int] = {}
    topic_sources: dict[str, set[str]] = {}
    topic_headlines: dict[str, list[dict]] = {}
    
    # 分析每条新闻
    for item in news_items:
        title = item.get("title", "")
        source = item.get("source", "Unknown")
        
        for topic in CORRELATION_TOPICS:
            topic_id = topic["id"]
            patterns = [re.compile(p, re.IGNORECASE) for p in topic["patterns"]]
            
            if any(p.search(title) for p in patterns):
                topic_counts[topic_id] = topic_counts.get(topic_id, 0) + 1
                
                if topic_id not in topic_sources:
                    topic_sources[topic_id] = set()
                    topic_headlines[topic_id] = []
                
                topic_sources[topic_id].add(source)
                if len(topic_headlines[topic_id]) < 5:
                    topic_headlines[topic_id].append({
                        "title": title,
                        "link": item.get("url", ""),
                        "source": source
                    })
    
    # 更新历史记录
    topic_history[current_minute] = topic_counts.copy()
    
    # 清理旧历史
    cutoff = current_minute - HISTORY_RETENTION_MINUTES
    to_delete = [k for k in topic_history if k < cutoff]
    for k in to_delete:
        del topic_history[k]
    
    # 获取旧数据用于动量比较
    old_minute = current_minute - MOMENTUM_WINDOW_MINUTES
    old_counts = topic_history.get(old_minute, {})
    
    # 处理每个主题
    for topic in CORRELATION_TOPICS:
        topic_id = topic["id"]
        count = topic_counts.get(topic_id, 0)
        sources = list(topic_sources.get(topic_id, set()))
        headlines = topic_headlines.get(topic_id, [])
        old_count = old_counts.get(topic_id, 0)
        delta = count - old_count
        
        # 新兴模式 (3+ mentions)
        if count >= 3:
            level = "high" if count >= 8 else "elevated" if count >= 5 else "emerging"
            results.emerging_patterns.append(EmergingPattern(
                id=topic_id,
                name=_format_topic_name(topic_id),
                category=topic["category"],
                count=count,
                level=level,
                sources=sources,
                headlines=headlines
            ))
        
        # 动量信号
        if delta >= 2 or (count >= 3 and delta >= 1):
            momentum = "surging" if delta >= 4 else "rising" if delta >= 2 else "stable"
            results.momentum_signals.append(MomentumSignal(
                id=topic_id,
                name=_format_topic_name(topic_id),
                category=topic["category"],
                current=count,
                delta=delta,
                momentum=momentum,
                headlines=headlines
            ))
        
        # 跨源关联 (3+ sources)
        if len(sources) >= 3:
            level = "high" if len(sources) >= 5 else "elevated" if len(sources) >= 4 else "emerging"
            results.cross_source_correlations.append(CrossSourceCorrelation(
                id=topic_id,
                name=_format_topic_name(topic_id),
                category=topic["category"],
                source_count=len(sources),
                sources=sources,
                level=level,
                headlines=headlines
            ))
        
        # 预测信号
        score = count * 2 + len(sources) * 3 + delta * 5
        if score >= 15:
            confidence = min(95, round(score * 1.5))
            prediction = _get_prediction(topic_id, count)
            level = "high" if confidence >= 70 else "medium" if confidence >= 50 else "low"
            results.predictive_signals.append(PredictiveSignal(
                id=topic_id,
                name=_format_topic_name(topic_id),
                category=topic["category"],
                score=score,
                confidence=confidence,
                prediction=prediction,
                level=level,
                headlines=headlines
            ))
    
    # 排序结果
    results.emerging_patterns.sort(key=lambda x: x.count, reverse=True)
    results.momentum_signals.sort(key=lambda x: x.delta, reverse=True)
    results.cross_source_correlations.sort(key=lambda x: x.source_count, reverse=True)
    results.predictive_signals.sort(key=lambda x: x.score, reverse=True)
    
    return results


def _get_prediction(topic_id: str, count: int) -> str:
    """生成预测文本"""
    predictions = {
        "tariffs": "Market volatility likely in next 24-48h",
        "fed-rates": "Expect increased financial sector coverage",
        "china-russia": "Geopolitical escalation narrative forming",
        "ukraine": "Breaking developments likely within hours",
        "layoffs": "Employment concerns may dominate news cycle",
    }
    
    if topic_id in predictions:
        return predictions[topic_id]
    
    return "Topic gaining mainstream traction"


def get_correlation_summary(results: Optional[CorrelationResults]) -> dict:
    """获取关联摘要"""
    if not results:
        return {"total_signals": 0, "status": "NO DATA"}
    
    total = (
        len(results.emerging_patterns) +
        len(results.momentum_signals) +
        len(results.predictive_signals)
    )
    
    return {
        "total_signals": total,
        "status": f"{total} SIGNALS" if total > 0 else "MONITORING"
    }


def clear_correlation_history():
    """清理关联历史"""
    topic_history.clear()