"""
NewsNotifier 单元测试
"""

import pytest
from datetime import datetime, timedelta

from agents.news_monitor.notifier import (
    NewsNotifier,
    NewsItem,
    AlertLevel,
    calculate_alert_level,
    CorrelationResult,
    AGENT_IDS,
)
from agents.news_monitor.news_classifier import NewsCategory, Sentiment


class TestAlertLevel:
    """告警级别测试"""
    
    def test_calculate_fed_rates_critical(self):
        """美联储新闻应该是 CRITICAL"""
        level = calculate_alert_level(
            NewsCategory.FED_RATES,
            Sentiment.NEUTRAL
        )
        assert level == AlertLevel.CRITICAL
    
    def test_calculate_geopolitics_negative_critical(self):
        """地缘政治 + 负面 = CRITICAL"""
        level = calculate_alert_level(
            NewsCategory.GEOPOLITICS,
            Sentiment.NEGATIVE
        )
        assert level == AlertLevel.CRITICAL
    
    def test_calculate_conflict_negative_critical(self):
        """冲突 + 负面 = CRITICAL"""
        level = calculate_alert_level(
            NewsCategory.CONFLICT,
            Sentiment.NEGATIVE
        )
        assert level == AlertLevel.CRITICAL
    
    def test_calculate_crypto_negative_high(self):
        """加密货币负面 = HIGH"""
        level = calculate_alert_level(
            NewsCategory.CRYPTO,
            Sentiment.NEGATIVE
        )
        assert level == AlertLevel.HIGH
    
    def test_calculate_crypto_positive_high(self):
        """加密货币正面 = HIGH"""
        level = calculate_alert_level(
            NewsCategory.CRYPTO,
            Sentiment.POSITIVE
        )
        assert level == AlertLevel.HIGH
    
    def test_calculate_market_negative_medium(self):
        """市场负面 = MEDIUM"""
        level = calculate_alert_level(
            NewsCategory.MARKET,
            Sentiment.NEGATIVE
        )
        assert level == AlertLevel.MEDIUM
    
    def test_calculate_market_neutral_low(self):
        """市场中性 = LOW"""
        level = calculate_alert_level(
            NewsCategory.MARKET,
            Sentiment.NEUTRAL
        )
        assert level == AlertLevel.LOW
    
    def test_calculate_tech_neutral_low(self):
        """科技中性 = LOW"""
        level = calculate_alert_level(
            NewsCategory.TECH,
            Sentiment.NEUTRAL
        )
        assert level == AlertLevel.LOW
    
    def test_calculate_correlation_high(self):
        """高关联分数 = HIGH"""
        correlation = CorrelationResult(
            emerging_patterns=3,
            momentum_signals=2,
            predictive=1,
            total_score=20,
        )
        level = calculate_alert_level(
            NewsCategory.MARKET,
            Sentiment.NEGATIVE,
            correlation
        )
        assert level == AlertLevel.HIGH


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
            published_at=datetime.now(),
        )
    
    def test_initialization(self):
        """初始化"""
        notifier = NewsNotifier()
        assert notifier.cooldown_minutes == 5
        assert notifier._notification_history == []
    
    def test_initialization_custom_cooldown(self):
        """自定义 cooldown"""
        notifier = NewsNotifier(cooldown_minutes=10)
        assert notifier.cooldown_minutes == 10
    
    @pytest.mark.asyncio
    async def test_notify_fed_rates(self, notifier, sample_news):
        """美联储新闻应该触发通知"""
        results = await notifier.notify(sample_news)
        assert isinstance(results, list)
    
    @pytest.mark.asyncio
    async def test_cooldown_check(self, notifier, sample_news):
        # 直接设置 cooldown key
        key = f"{sample_news.source}:{sample_news.title[:50]}"
        notifier._last_notification[key] = datetime.now()
        
        # 第二次应该被 cooldown
        is_cooldown = await notifier._is_in_cooldown(sample_news)
        assert is_cooldown is True
    
    @pytest.mark.asyncio
    async def test_cooldown_expired(self, notifier, sample_news):
        """cooldown 过期后应该可以通知"""
        notifier = NewsNotifier(cooldown_minutes=0)
        
        # 第一次通知
        await notifier.notify(sample_news)
        
        # cooldown=0 应该立即过期
        is_cooldown = await notifier._is_in_cooldown(sample_news)
        assert is_cooldown is False
    
    @pytest.mark.asyncio
    async def test_call_agent(self, notifier):
        """call_agent 应该能调用"""
        result = await notifier.call_agent(
            "fin/intel/market",
            "Test message"
        )
        # 应该返回结果（即使是降级结果）
        assert "status" in result
    
    @pytest.mark.asyncio
    async def test_call_agent_with_invalid_id(self, notifier):
        """无效 agent ID 应该是降级"""
        result = await notifier.call_agent(
            "invalid/agent/id",
            "Test"
        )
        assert result["status"] in ["sent", "logged"]
    
    @pytest.mark.asyncio
    async def test_format_message(self, notifier, sample_news):
        """消息格式化"""
        msg = notifier._format_message(sample_news, "CRITICAL")
        assert "CRITICAL" in msg
        assert "Federal Reserve" in msg
    
    def test_get_notification_history(self, notifier):
        """历史记录"""
        notifier._notification_history.append({"test": "data"})
        history = notifier.get_notification_history()
        assert len(history) >= 1
    
    def test_clear_history(self, notifier):
        """清空历史"""
        notifier._notification_history.append({"test": "data"})
        notifier.clear_history()
        assert len(notifier._notification_history) == 0


class TestCorrelationResult:
    """CorrelationResult 测试"""
    
    def test_total_signals(self):
        """总信号数"""
        corr = CorrelationResult(
            emerging_patterns=3,
            momentum_signals=2,
            predictive=1,
        )
        assert corr.total_signals == 6
    
    def test_total_signals_zero(self):
        """零信号"""
        corr = CorrelationResult()
        assert corr.total_signals == 0


class TestAgentIds:
    """AGENT_IDS 测试"""
    
    def test_all_agents_defined(self):
        """所有 agent 都定义"""
        assert "market" in AGENT_IDS
        assert "quant" in AGENT_IDS
        assert "risk" in AGENT_IDS
    
    def test_agent_format(self):
        """agent ID 格式"""
        assert "/" in AGENT_IDS["market"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])