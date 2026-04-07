"""
Narrative Tracker - 分析边缘到主流的叙事传播

功能：
- 边缘叙事检测 (Emerging Fringe)
- 跨主流检测 (Fringe to Mainstream)
- 虚假信息信号
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

# 源分类配置
SOURCE_TYPES = {
    "fringe": ["citizen", "anonymous", "leak", "whistleblower", "independent"],
    "alternative": ["blog", "substack", "medium", "substack"],
    "mainstream": ["reuters", "ap", "bbc", "nyt", "wsj", "cnn", "bloomberg", "cnbc"],
}

# 叙事模式
NARRATIVE_PATTERNS = [
    {"id": "election-fraud", "category": "Politics", "severity": "high", "keywords": [r"fraud", r"stolen", r"rigged"]},
    {"id": "conspiracy", "category": "Conspiracy", "severity": "high", "keywords": [r"conspiracy", r"cover-up", r"secret"]},
    {"id": "disinformation", "category": "InfoOps", "severity": "high", "keywords": [r"fake", r"disinformation", r"misinformation"]},
    {"id": "health-concern", "category": "Health", "severity": "medium", "keywords": [r"danger", r"harmful", r"risk"]},
    {"id": "economic-crisis", "category": "Economy", "severity": "medium", "keywords": [r"crisis", r"collapse", r"depression"]},
]


@dataclass
class EmergingFringe:
    id: str
    name: str
    category: str
    severity: str
    count: int
    fringe_count: int
    mainstream_count: int
    sources: list[str]
    headlines: list[dict]
    status: str  # emerging, spreading, viral


@dataclass
class FringeToMainstream:
    id: str
    name: str
    category: str
    severity: str
    count: int
    fringe_count: int
    mainstream_count: int
    sources: list[str]
    headlines: list[dict]
    status: str  # crossing
    crossover_level: int


@dataclass
class NarrativeResults:
    emerging_fringe: list[EmergingFringe] = field(default_factory=list)
    fringe_to_mainstream: list[FringeToMainstream] = field(default_factory=list)
    narrative_watch: list[dict] = field(default_factory=list)
    disinfo_signals: list[dict] = field(default_factory=list)


# 历史记录
narrative_history: dict[str, dict] = {}


def _classify_source(source: str) -> str:
    """分类来源类型"""
    lower = source.lower()
    
    for fringe in SOURCE_TYPES["fringe"]:
        if fringe in lower:
            return "fringe"
    for alt in SOURCE_TYPES["alternative"]:
        if alt in lower:
            return "alternative"
    for ms in SOURCE_TYPES["mainstream"]:
        if ms in lower:
            return "mainstream"
    
    return "unknown"


def _format_narrative_name(narrative_id: str) -> str:
    """格式化叙事名称"""
    return narrative_id.replace("-", " ").title()


def analyze_narratives(news_items: list[dict]) -> Optional[NarrativeResults]:
    """
    分析叙事传播
    
    Args:
        news_items: 新闻列表 [{"title": str, "source": str}, ...]
    
    Returns:
        NarrativeResults 或 None
    """
    if not news_items:
        return None
    
    results = NarrativeResults()
    
    # 按叙事模式统计
    narrative_counts: dict[str, dict] = {}
    
    for item in news_items:
        title = item.get("title", "")
        source = item.get("source", "Unknown")
        source_type = _classify_source(source)
        
        for pattern in NARRATIVE_PATTERNS:
            pattern_id = pattern["id"]
            keywords = [re.compile(k, re.IGNORECASE) for k in pattern["keywords"]]
            
            if any(k.search(title) for k in keywords):
                if pattern_id not in narrative_counts:
                    narrative_counts[pattern_id] = {
                        "category": pattern["category"],
                        "severity": pattern["severity"],
                        "count": 0,
                        "fringe_count": 0,
                        "mainstream_count": 0,
                        "sources": set(),
                        "headlines": [],
                    }
                
                data = narrative_counts[pattern_id]
                data["count"] += 1
                data["sources"].add(source)
                
                if source_type == "fringe":
                    data["fringe_count"] += 1
                elif source_type == "mainstream":
                    data["mainstream_count"] += 1
                
                if len(data["headlines"]) < 5:
                    data["headlines"].append({
                        "title": title,
                        "link": item.get("url", ""),
                        "source": source,
                        "source_type": source_type,
                    })
    
    # 处理每个叙事
    for pattern in NARRATIVE_PATTERNS:
        pattern_id = pattern["id"]
        
        if pattern_id not in narrative_counts:
            continue
        
        data = narrative_counts[pattern_id]
        
        # 虚假信息信号
        if pattern["severity"] == "high" and data["fringe_count"] >= 2:
            results.disinfo_signals.append({
                "id": pattern_id,
                "name": _format_narrative_name(pattern_id),
                "category": data["category"],
                "count": data["count"],
                "fringe_count": data["fringe_count"],
                "sources": list(data["sources"]),
                "headlines": data["headlines"],
            })
        
        # 边缘叙事
        if data["fringe_count"] >= 2:
            status = "viral" if data["count"] >= 5 else "spreading" if data["fringe_count"] >= 3 else "emerging"
            results.emerging_fringe.append(EmergingFringe(
                id=pattern_id,
                name=_format_narrative_name(pattern_id),
                category=data["category"],
                severity=data["severity"],
                count=data["count"],
                fringe_count=data["fringe_count"],
                mainstream_count=data["mainstream_count"],
                sources=list(data["sources"]),
                headlines=data["headlines"],
                status=status,
            ))
        
        # 跨主流
        if data["fringe_count"] >= 1 and data["mainstream_count"] >= 1:
            crossover = data["fringe_count"] + data["mainstream_count"]
            results.fringe_to_mainstream.append(FringeToMainstream(
                id=pattern_id,
                name=_format_narrative_name(pattern_id),
                category=data["category"],
                severity=data["severity"],
                count=data["count"],
                fringe_count=data["fringe_count"],
                mainstream_count=data["mainstream_count"],
                sources=list(data["sources"]),
                headlines=data["headlines"],
                status="crossing",
                crossover_level=crossover,
            ))
        
        # 监控列表
        if data["count"] >= 1:
            results.narrative_watch.append({
                "id": pattern_id,
                "name": _format_narrative_name(pattern_id),
                "category": data["category"],
                "count": data["count"],
                "sources": list(data["sources"]),
            })
    
    # 排序
    results.emerging_fringe.sort(key=lambda x: x.count, reverse=True)
    results.fringe_to_mainstream.sort(key=lambda x: x.crossover_level, reverse=True)
    results.disinfo_signals.sort(key=lambda x: x.get("count", 0), reverse=True)
    
    return results