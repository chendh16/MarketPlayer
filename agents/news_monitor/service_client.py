"""
ServiceClient - 统一 HTTP 客户端（缓存/重试/熔断）

特性：
- 异步 HTTP 请求（httpx）
- 内存缓存 + 可选 Redis 后端
- 指数退避重试
- 熔断器模式
- 请求去重

用法:
    client = ServiceClient()
    result = await client.request("https://api.example.com/data")
"""

import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional

import httpx

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """熔断器状态"""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half-open"


@dataclass
class CircuitBreakerConfig:
    """熔断器配置"""
    failure_threshold: int = 5  # 失败次数阈值
    recovery_timeout: float = 60.0  # 恢复超时（秒）
    half_open_max_calls: int = 3  # 半开状态最大尝试次数


class CircuitBreaker:
    """熔断器实现"""

    def __init__(self, name: str, config: Optional[CircuitBreakerConfig] = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[float] = None
        self._half_open_calls = 0

    def can_request(self) -> bool:
        """检查是否可以发起请求"""
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            # 检查是否超时可以进入半开状态
            if self.last_failure_time and \
               time.time() - self.last_failure_time > self.config.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self._half_open_calls = 0
                return True
            return False
        # HALF_OPEN
        return self._half_open_calls < self.config.half_open_max_calls

    def record_success(self):
        """记录成功"""
        self.failure_count = 0
        if self.state == CircuitState.HALF_OPEN:
            self._half_open_calls += 1
            if self._half_open_calls >= self.config.half_open_max_calls:
                self.state = CircuitState.CLOSED
        elif self.state != CircuitState.CLOSED:
            self.state = CircuitState.CLOSED

    def record_failure(self):
        """记录失败"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.config.failure_threshold:
            self.state = CircuitState.OPEN

    def get_state(self) -> dict:
        """获取状态"""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "last_failure_time": self.last_failure_time,
        }


@dataclass
class CacheEntry:
    """缓存条目"""
    data: Any
    timestamp: float
    ttl: int  # 秒

    def is_expired(self) -> bool:
        return time.time() - self.timestamp > self.ttl


class CacheManager:
    """内存缓存管理器"""

    def __init__(self, ttl: int = 300, max_size: int = 1000):
        self.ttl = ttl
        self.max_size = max_size
        self._cache: dict[str, CacheEntry] = {}

    def get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        entry = self._cache.get(key)
        if entry is None:
            return None
        if entry.is_expired():
            del self._cache[key]
            return None
        return entry.data

    def set(self, key: str, data: Any, ttl: Optional[int] = None):
        """设置缓存"""
        # LRU 淘汰
        if len(self._cache) >= self.max_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k].timestamp)
            del self._cache[oldest_key]

        self._cache[key] = CacheEntry(
            data=data,
            timestamp=time.time(),
            ttl=ttl or self.ttl
        )

    def delete(self, key: str):
        """删除缓存"""
        self._cache.pop(key, None)

    def clear(self):
        """清空缓存"""
        self._cache.clear()

    def get_stats(self) -> dict:
        """获取缓存统计"""
        return {
            "size": len(self._cache),
            "max_size": self.max_size,
            "ttl": self.ttl,
        }


class RequestDeduplicator:
    """请求去重器"""

    def __init__(self):
        self._in_flight: dict[str, asyncio.Future] = {}

    def get_key(self, url: str, params: Optional[dict] = None) -> str:
        """生成去重 key"""
        key_data = url
        if params:
            key_data += "?" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        return hashlib.md5(key_data.encode()).hexdigest()

    async def dedupe(self, key: str, coro: Callable) -> Any:
        """去重执行"""
        if key in self._in_flight:
            # 等待已有请求完成
            return await self._in_flight[key]

        # 创建新的 future
        future = asyncio.Future()
        self._in_flight[key] = future

        try:
            result = await coro()
            future.set_result(result)
            return result
        except Exception as e:
            future.set_exception(e)
            raise
        finally:
            self._in_flight.pop(key, None)


@dataclass
class RequestOptions:
    """请求选项"""
    params: Optional[dict] = None
    use_cache: bool = True
    cache_ttl: int = 300
    retries: int = 2
    timeout: float = 10.0
    headers: Optional[dict] = None
    response_type: str = "json"


@dataclass
class RequestResult:
    """请求结果"""
    data: Any
    from_cache: bool = False
    attempt: int = 1
    circuit_open: bool = False


class ServiceClient:
    """
    统一 HTTP 客户端

    特性：
    - 异步请求
    - 内存缓存
    - 指数退避重试
    - 熔断器
    - 请求去重
    """

    def __init__(
        self,
        cache_ttl: int = 300,
        default_timeout: float = 10.0,
        default_retries: int = 2,
    ):
        self.default_timeout = default_timeout
        self.default_retries = default_retries
        self.cache = CacheManager(ttl=cache_ttl)
        self.breakers: dict[str, CircuitBreaker] = {}
        self.deduplicator = RequestDeduplicator()

    def get_breaker(self, name: str) -> CircuitBreaker:
        """获取或创建熔断器"""
        if name not in self.breakers:
            self.breakers[name] = CircuitBreaker(name)
        return self.breakers[name]

    async def request(
        self,
        url: str,
        options: Optional[RequestOptions] = None,
        service_name: Optional[str] = None,
    ) -> RequestResult:
        """
        发起请求

        Args:
            url: 请求 URL
            options: 请求选项
            service_name: 服务名称（用于熔断器）

        Returns:
            RequestResult: 请求结果
        """
        options = options or RequestOptions()
        service_name = service_name or self._extract_service_name(url)
        cache_key = self.deduplicator.get_key(url, options.params)

        # 1. 检查缓存
        if options.use_cache:
            cached = self.cache.get(cache_key)
            if cached is not None:
                return RequestResult(data=cached, from_cache=True)

        # 2. 检查熔断器
        breaker = self.get_breaker(service_name)
        if not breaker.can_request():
            cached = self.cache.get(cache_key)
            if cached is not None:
                return RequestResult(data=cached, from_cache=True, circuit_open=True)
            raise CircuitOpenError(service_name)

        # 3. 去重执行
        async def do_request():
            return await self._execute_request(
                url, options, service_name, cache_key, breaker
            )

        return await self.deduplicator.dedupe(cache_key, lambda: do_request())

    async def _execute_request(
        self,
        url: str,
        options: RequestOptions,
        service_name: str,
        cache_key: str,
        breaker: CircuitBreaker,
    ) -> RequestResult:
        """执行实际请求"""
        last_error: Optional[Exception] = None

        for attempt in range(options.retries + 1):
            try:
                data = await self._fetch(url, options)
                breaker.record_success()

                # 缓存成功响应
                if options.use_cache:
                    self.cache.set(cache_key, data, options.cache_ttl)

                return RequestResult(data=data, attempt=attempt + 1)

            except Exception as e:
                last_error = e
                logger.warning(
                    f"Request failed (attempt {attempt + 1}/{options.retries + 1}): {e}"
                )

                # 不重试特定错误
                if isinstance(e, (CircuitOpenError, httpx.HTTPStatusError)):
                    if e.__class__ == httpx.HTTPStatusError:
                        status = e.response.status_code
                        if status in (401, 403, 404):
                            break

                if attempt < options.retries:
                    await asyncio.sleep(self._get_backoff_delay(attempt))

        breaker.record_failure()

        # 尝试返回过期缓存
        stale = self.cache.get(cache_key)
        if stale is not None:
            logger.warning(
                f"{service_name}: Returning stale cache after {options.retries + 1} failed attempts"
            )
            return RequestResult(data=stale, from_cache=True)

        raise last_error

    async def _fetch(self, url: str, options: RequestOptions) -> Any:
        """发起 HTTP 请求"""
        timeout = httpx.Timeout(options.timeout)

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                url,
                params=options.params,
                headers=options.headers,
            )
            response.raise_for_status()
            
            if options.response_type == "text":
                return response.text
            return response.json()

    def _extract_service_name(self, url: str) -> str:
        """从 URL 提取服务名称"""
        try:
            from urllib.parse import urlparse
            return urlparse(url).netloc.replace(".", "_")
        except Exception:
            return "unknown"

    def _get_backoff_delay(self, attempt: int) -> float:
        """计算指数退避延迟"""
        base_delay = 2 ** attempt
        jitter = 0.5  # 0-0.5秒随机抖动
        return min(base_delay + (jitter * (attempt + 1)), 10.0)

    def get_health_status(self) -> dict:
        """获取健康状态"""
        return {
            "circuit_breakers": {
                name: b.get_state()
                for name, b in self.breakers.items()
            },
            "cache_stats": self.cache.get_stats(),
        }

    def clear_cache(self):
        """清空缓存"""
        self.cache.clear()

    def reset_breakers(self):
        """重置所有熔断器"""
        for breaker in self.breakers.values():
            breaker.state = CircuitState.CLOSED
            breaker.failure_count = 0
            breaker.success_count = 0


class CircuitOpenError(Exception):
    """熔断器打开错误"""

    def __init__(self, service_name: str):
        self.service_name = service_name
        super().__init__(f"Circuit breaker is open for {service_name}")


# 导出单例
service_client = ServiceClient()