"""
ServiceClient 单元测试
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, Mock, patch

from agents.news_monitor.service_client import (
    ServiceClient,
    CacheManager,
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitState,
    RequestOptions,
    RequestDeduplicator,
    CircuitOpenError,
)


class TestCircuitBreaker:
    """熔断器测试"""

    def test_initial_state_closed(self):
        """初始状态为关闭"""
        breaker = CircuitBreaker("test")
        assert breaker.state == CircuitState.CLOSED
        assert breaker.can_request() is True

    def test_open_after_failures(self):
        """失败达到阈值后打开"""
        config = CircuitBreakerConfig(failure_threshold=3)
        breaker = CircuitBreaker("test", config)

        for _ in range(3):
            breaker.record_failure()

        assert breaker.state == CircuitState.OPEN
        assert breaker.can_request() is False

    def test_half_open_after_timeout(self):
        """超时后进入半开"""
        config = CircuitBreakerConfig(failure_threshold=2, recovery_timeout=0.1)
        breaker = CircuitBreaker("test", config)

        breaker.record_failure()
        breaker.record_failure()

        # 立即检查：应该 OPEN
        assert breaker.state == CircuitState.OPEN

        # 等待超时
        import time
        time.sleep(0.15)

        # 超时后：应该进入 HALF_OPEN
        assert breaker.can_request() is True
        assert breaker.state == CircuitState.HALF_OPEN

    def test_close_on_success(self):
        """成功后关闭"""
        breaker = CircuitBreaker("test")
        breaker.record_failure()
        breaker.record_failure()

        breaker.record_success()

        assert breaker.state == CircuitState.CLOSED
        assert breaker.failure_count == 0

    def test_get_state(self):
        """获取状态"""
        breaker = CircuitBreaker("test")
        breaker.record_failure()

        state = breaker.get_state()
        assert state["name"] == "test"
        assert state["failure_count"] == 1


class TestCacheManager:
    """缓存管理器测试"""

    def test_get_set(self):
        """基本 get/set"""
        cache = CacheManager(ttl=60)

        cache.set("key1", {"data": "test"})
        assert cache.get("key1") == {"data": "test"}

    def test_get_nonexistent(self):
        """获取不存在的 key"""
        cache = CacheManager(ttl=60)
        assert cache.get("nonexistent") is None

    def test_expiry(self):
        """过期"""
        cache = CacheManager(ttl=1)

        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"

        # 等待过期
        import time
        time.sleep(1.1)

        assert cache.get("key1") is None

    def test_delete(self):
        """删除"""
        cache = CacheManager(ttl=60)

        cache.set("key1", "value1")
        cache.delete("key1")

        assert cache.get("key1") is None

    def test_clear(self):
        """清空"""
        cache = CacheManager(ttl=60)

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.clear()

        assert cache.get("key1") is None
        assert cache.get("key2") is None

    def test_lru_eviction(self):
        """LRU 淘汰"""
        cache = CacheManager(max_size=2, ttl=60)

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")  # 这应该触发淘汰

        # key1 应该被淘汰
        assert cache.get("key1") is None
        assert cache.get("key2") == "value2"
        assert cache.get("key3") == "value3"

    def test_get_stats(self):
        """统计"""
        cache = CacheManager(max_size=100, ttl=300)

        cache.set("key1", "value1")

        stats = cache.get_stats()
        assert stats["size"] == 1
        assert stats["max_size"] == 100


class TestRequestDeduplicator:
    """请求去重测试"""

    @pytest.mark.asyncio
    async def test_dedupe(self):
        """去重"""
        dedup = RequestDeduplicator()

        results = []

        async def task():
            await asyncio.sleep(0.1)
            return "result"

        key = dedup.get_key("http://test.com")
        result1 = await dedup.dedupe(key, task)
        results.append(result1)

        assert results[0] == "result"

    @pytest.mark.asyncio
    async def test_concurrent_same_key(self):
        """并发相同 key"""
        dedup = RequestDeduplicator()

        call_count = 0

        async def task():
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.1)
            return "result"

        key = dedup.get_key("http://test.com")

        # 并发执行
        results = await asyncio.gather(
            dedup.dedupe(key, task),
            dedup.dedupe(key, task),
        )

        # 只调用一次
        assert call_count == 1
        assert results[0] == results[1] == "result"


class TestServiceClient:
    """ServiceClient 测试"""

    @pytest.mark.asyncio
    async def test_cache(self):
        """缓存"""
        client = ServiceClient(cache_ttl=60)

        with patch.object(client, "_fetch") as mock_fetch:
            mock_fetch.return_value = {"data": "test"}

            # 第一次请求
            result1 = await client.request(
                "http://test.com/api",
                options=RequestOptions(use_cache=True),
            )

            # 第二次请求（应该从缓存）
            result2 = await client.request(
                "http://test.com/api",
                options=RequestOptions(use_cache=True),
            )

            assert result1.data == result2.data
            assert result2.from_cache is True
            mock_fetch.assert_called_once()

    @pytest.mark.asyncio
    async def test_circuit_breaker(self):
        """熔断器"""
        client = ServiceClient()

        # 模拟连续失败
        with patch.object(client, "_fetch") as mock_fetch:
            mock_fetch.side_effect = Exception("Network error")

            with pytest.raises(Exception):
                await client.request(
                    "http://test.com/api",
                    options=RequestOptions(retries=0),
                )

            # 熔断器应该打开
            breaker = client.get_breaker("test_com")
            assert breaker.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_retry(self):
        """重试"""
        client = ServiceClient()
        call_count = 0

        with patch.object(client, "_fetch") as mock_fetch:
            def side_effect(*args, **kwargs):
                nonlocal call_count
                call_count += 1
                if call_count < 3:
                    raise Exception("Temp error")
                return {"data": "ok"}

            mock_fetch.side_effect = side_effect

            result = await client.request(
                "http://test.com/api",
                options=RequestOptions(retries=3),
            )

            assert result.data == {"data": "ok"}
            assert result.attempt == 3

    @pytest.mark.asyncio
    async def test_stale_cache_fallback(self):
        """过期缓存回退"""
        client = ServiceClient()

        # 先设置缓存
        client.cache.set("test", "cached_value", ttl=1)

        # 然后模拟失败
        with patch.object(client, "_fetch") as mock_fetch:
            mock_fetch.side_effect = Exception("Network error")

            # 等待缓存过期
            import time
            time.sleep(1.1)

            result = await client.request(
                "http://test.com/api",
                options=RequestOptions(use_cache=True),
            )

            assert result.from_cache is True

    @pytest.mark.asyncio
    async def test_get_health_status(self):
        """健康状态"""
        client = ServiceClient()

        status = client.get_health_status()
        assert "cache_stats" in status
        assert "circuit_breakers" in status

    @pytest.mark.asyncio
    async def test_clear_cache(self):
        """清空缓存"""
        client = ServiceClient()
        client.cache.set("key1", "value1")

        client.clear_cache()

        assert client.cache.get("key1") is None


# 运行测试
if __name__ == "__main__":
    pytest.main([__file__, "-v"])