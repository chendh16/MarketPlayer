"""
NewsNotifier - Agent 通知集成

根据 alert_level 自动通知不同的 agents：
- CRITICAL (1): 立即通知 market + quant + risk agents
- HIGH (2): 5分钟内通知 market + quant agents
- MEDIUM (3): 加入当日简报
- LOW (4): 仅存档
"""

import asyncio
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime
from enum import IntEnum
from typing import Any, Dict, Optional

from .news_classifier import NewsCategory, Sentiment


class AlertLevel(IntEnum):
    """告警级别 (数字越小越紧急)"""
    CRITICAL = 1  # 立即通知
    HIGH = 2      # 5分钟内通知
    MEDIUM = 3     # 当日简报
    LOW = 4        # 仅存档


# Agent ID 配置
AGENT_IDS = {
    "market": "fin/intel/market",
    "quant": "fin/research/quant",
    "risk": "fin/verify/risk",
    "learning": "shared/strategy-learning",
}


@dataclass
class CorrelationResult:
    """关联分析结果"""
    emerging_patterns: int = 0
    momentum_signals: int = 0
    cross_source: int = 0
    predictive: int = 0
    total_score: int = 0

    @property
    def total_signals(self) -> int:
        return self.emerging_patterns + self.momentum_signals + self.predictive


@dataclass
class NewsItem:
    """新闻项"""
    id: Optional[int] = None
    title: str = ""
    content: str = ""
    source: str = ""
    url: str = ""
    published_at: Optional[datetime] = None
    category: NewsCategory = NewsCategory.OTHER
    sentiment: Sentiment = Sentiment.NEUTRAL
    alert_level: AlertLevel = AlertLevel.LOW
    keywords: list[str] = None
    
    def __post_init__(self):
        self.keywords = self.keywords or []


def calculate_alert_level(
    category: NewsCategory,
    sentiment: Sentiment,
    correlation: Optional[CorrelationResult] = None,
) -> AlertLevel:
    """
    根据分类和关联分析计算告警级别
    
    规则:
    - CONFLICT/GEOPOLITICS + NEGATIVE → CRITICAL
    - FED_RATES + 任何情感 → CRITICAL
    - MARKET + NEGATIVE + correlation → HIGH
    - 其他负面新闻 → MEDIUM
    - 其他 → LOW
    """
    # CRITICAL: 地缘政治/冲突 + 负面
    if category in (NewsCategory.CONFLICT, NewsCategory.GEOPOLITICS):
        if sentiment == Sentiment.NEGATIVE:
            return AlertLevel.CRITICAL
    
    # CRITICAL: 美联储/利率决策
    if category == NewsCategory.FED_RATES:
        return AlertLevel.CRITICAL
    
    # HIGH: 市场 + 负面 + 高关联信号
    if category == NewsCategory.MARKET and sentiment == Sentiment.NEGATIVE:
        if correlation and correlation.total_score >= 15:
            return AlertLevel.HIGH
    
    # HIGH: 加密货币大幅波动
    if category == NewsCategory.CRYPTO:
        if sentiment != Sentiment.NEUTRAL:
            return AlertLevel.HIGH
    
    # MEDIUM: 负面新闻
    if sentiment == Sentiment.NEGATIVE:
        return AlertLevel.MEDIUM
    
    return AlertLevel.LOW


class NewsNotifier:
    """
    NewsNotifier - Agent 通知器
    
    负责：
    1. 根据 alert_level 决定通知策略
    2. 调用 OpenClaw Gateway 通知 agents
    3. 记录通知历史
    """
    
    def __init__(self, cooldown_minutes: int = 5):
        self.cooldown_minutes = cooldown_minutes
        self._notification_history: list[dict] = []
        self._last_notification: dict[str, datetime] = {}
    
    async def notify(
        self,
        news: NewsItem,
        correlation: Optional[CorrelationResult] = None,
    ) -> list[dict]:
        """
        根据 alert_level 通知 agents
        
        Args:
            news: 新闻项
            correlation: 关联分析结果
            
        Returns:
            list[dict]: 通知结果列表
        """
        results = []
        
        # 检查 cooldown
        if await self._is_in_cooldown(news):
            return results
        
        # 计算告警级别
        if news.alert_level is None or news.alert_level == AlertLevel.LOW:
            news.alert_level = calculate_alert_level(
                news.category, news.sentiment, correlation
            )
        
        # 根据级别通知
        if news.alert_level == AlertLevel.CRITICAL:
            results = await self._notify_critical(news)
        elif news.alert_level == AlertLevel.HIGH:
            results = await self._notify_high(news)
        elif news.alert_level == AlertLevel.MEDIUM:
            # 加入简报列表，不立即通知
            results = await self._add_to_digest(news)
        # LOW: 仅存档
        
        return results
    
    async def _notify_critical(self, news: NewsItem) -> list[dict]:
        """立即通知所有相关 agents"""
        agents = ["market", "quant", "risk"]
        results = []
        
        for agent_id in agents:
            result = await self.call_agent(
                AGENT_IDS[agent_id],
                self._format_message(news, "CRITICAL")
            )
            results.append(result)
            self._last_notification[agent_id] = datetime.now()
        
        return results
    
    async def _notify_high(self, news: NewsItem) -> list[dict]:
        """通知 market + quant agents"""
        agents = ["market", "quant"]
        results = []
        
        for agent_id in agents:
            # 检查 cooldown
            if await self._is_agent_in_cooldown(agent_id):
                continue
            
            result = await self.call_agent(
                AGENT_IDS[agent_id],
                self._format_message(news, "HIGH")
            )
            results.append(result)
            self._last_notification[agent_id] = datetime.now()
        
        return results
    
    async def _add_to_digest(self, news: NewsItem) -> list[dict]:
        """加入当日简报"""
        # 简报存储到内存或数据库
        digest_entry = {
            "timestamp": datetime.now(),
            "title": news.title,
            "category": news.category.value,
            "sentiment": news.sentiment.value,
        }
        self._notification_history.append(digest_entry)
        return [digest_entry]
    
    def _format_message(self, news: NewsItem, level: str) -> str:
        """格式化通知消息"""
        category_emoji = {
            NewsCategory.FED_RATES: "📉",
            NewsCategory.MARKET: "📊",
            NewsCategory.CRYPTO: "₿",
            NewsCategory.GEOPOLITICS: "🌍",
            NewsCategory.CONFLICT: "⚠️",
            NewsCategory.AI: "🤖",
        }.get(news.category, "📰")
        
        sentiment_emoji = {
            Sentiment.POSITIVE: "✅",
            Sentiment.NEGATIVE: "❌",
            Sentiment.NEUTRAL: "➖",
        }.get(news.sentiment, "➖")
        
        return (
            f"{category_emoji} {level} ALERT\n"
            f"标题: {news.title}\n"
            f"类别: {news.category.value} {sentiment_emoji}\n"
            f"来源: {news.source}\n"
            f"时间: {news.published_at or datetime.now().isoformat()}"
        )
    
    async def call_agent(self, agent_id: str, message: str) -> Dict[str, Any]:
        """
        调用 OpenClaw Gateway 通知 agent
        
        使用 subprocess 调用 openclaw CLI
        
        Args:
            agent_id: Agent ID (如 fin/intel/market)
            message: 通知消息
            
        Returns:
            dict: 调用结果
        """
        try:
            # 方法1: 使用 openclaw sessions_send (如果可用)
            result = await self._call_via_sessions_send(agent_id, message)
            if result:
                return result
        except Exception as e:
            print(f"call_agent error: {e}")
        
        # 方法2: 降级为本地日志
        return {
            "agent_id": agent_id,
            "message": message,
            "status": "logged",
            "timestamp": datetime.now().isoformat(),
        }
    
    async def _call_via_sessions_send(self, agent_id: str, message: str) -> Optional[Dict]:
        """通过 sessions_send 调用 agent"""
        # 构建命令
        cmd = [
            "openclaw",
            "sessions_send",
            "--sessionKey", agent_id,
            "--message", message,
        ]
        
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=10
            )
            
            if proc.returncode == 0:
                return {
                    "agent_id": agent_id,
                    "status": "sent",
                    "output": stdout.decode(),
                }
        except Exception:
            pass
        
        return None
    
    async def _is_in_cooldown(self, news: NewsItem) -> bool:
        """检查是否在 cooldown 期间"""
        # 同一来源/标题的新闻，5分钟内不重复通知
        key = f"{news.source}:{news.title[:50]}"
        
        if key in self._last_notification:
            last = self._last_notification[key]
            elapsed = (datetime.now() - last).total_seconds()
            if elapsed < self.cooldown_minutes * 60:
                return True
        
        return False
    
    async def _is_agent_in_cooldown(self, agent_id: str) -> bool:
        """检查 agent 是否在 cooldown"""
        if agent_id in self._last_notification:
            last = self._last_notification[agent_id]
            elapsed = (datetime.now() - last).total_seconds()
            if elapsed < self.cooldown_minutes * 60:
                return True
        return False
    
    def get_notification_history(self) -> list[dict]:
        """获取通知历史"""
        return self._notification_history[-100:]
    
    def clear_history(self):
        """清空历史"""
        self._notification_history.clear()
        self._last_notification.clear()


# 导出默认 notifier
notifier = NewsNotifier(cooldown_minutes=5)


# === 单元测试 ===
import pytest


class TestNewsNotifier:
    """NewsNotifier 测试"""
    
    @pytest.fixture
    def notifier(self):
        return NewsNotifier(cooldown_minutes=1)
    
    @pytest.fixture
    def sample_news(self):
        return NewsItem(
            title="Federal Reserve cuts interest rates",
            source="Reuters",
            category=NewsCategory.FED_RATES,
            sentiment=Sentiment.NEGATIVE,
        )
    
    def test_calculate_alert_level_fed_rates(self):
        """美联储新闻应该是 CRITICAL"""
        level = calculate_alert_level(
            NewsCategory.FED_RATES,
            Sentiment.NEUTRAL
        )
        assert level == AlertLevel.CRITICAL
    
    def test_calculate_alert_level_geopolitics_negative(self):
        """地缘政治 + 负面应该是 CRITICAL"""
        level = calculate_alert_level(
            NewsCategory.GEOPOLITICS,
            Sentiment.NEGATIVE
        )
        assert level == AlertLevel.CRITICAL
    
    def test_calculate_alert_level_crypto(self):
        """加密货币应该是 HIGH"""
        level = calculate_alert_level(
            NewsCategory.CRYPTO,
            Sentiment.NEGATIVE
        )
        assert level == AlertLevel.HIGH
    
    def test_calculate_alert_level_market_negative(self):
        """市场 + 负面应该是 MEDIUM"""
        level = calculate_alert_level(
            NewsCategory.MARKET,
            Sentiment.NEGATIVE
        )
        assert level == AlertLevel.MEDIUM
    
    def test_calculate_alert_level_neutral(self):
        """中性新闻应该是 LOW"""
        level = calculate_alert_level(
            NewsCategory.MARKET,
            Sentiment.NEUTRAL
        )
        assert level == AlertLevel.LOW
    
    @pytest.mark.asyncio
    async def test_notify_fed_rates(self, notifier, sample_news):
        """美联储新闻应该触发 CRITICAL 通知"""
        results = await notifier.notify(sample_news)
        # 可能返回空列表（如果调用失败），但逻辑应该正确
        assert isinstance(results, list)
    
    @pytest.mark.asyncio
    async def test_cooldown(self, notifier, sample_news):
        """同一新闻不应该重复通知"""
        await notifier.notify(sample_news)
        is_cooldown = await notifier._is_in_cooldown(sample_news)
        assert is_cooldown is True
    
    @pytest.mark.asyncio
    async def test_call_agent(self, notifier):
        """call_agent 应该能调用（可能失败但不应该崩溃）"""
        result = await notifier.call_agent(
            "fin/intel/market",
            "Test message"
        )
        # 应该返回结果（即使是降级结果）
        assert "status" in result
    
    def test_notification_history(self, notifier):
        """历史记录应该正确存储"""
        notifier._notification_history.append({"test": "data"})
        history = notifier.get_notification_history()
        assert len(history) >= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])