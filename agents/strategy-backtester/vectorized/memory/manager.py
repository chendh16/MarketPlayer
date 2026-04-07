"""
manager.py - 记忆管理模块

功能：
- MemoryManager 类
- PostgreSQL 持久化
- Redis 缓存
- 回测结果缓存
"""

import os
import json
import numpy as np
from typing import Optional, Dict, List
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import redis


class MemoryManager:
    """记忆管理器 - 集成 MarketPlayer 记忆系统"""
    
    def __init__(
        self,
        db_config: dict = None,
        redis_config: dict = None
    ):
        """
        初始化
        
        Args:
            db_config: PostgreSQL 配置
            redis_config: Redis 配置
        """
        # 默认配置
        self.db_config = db_config or {
            'host': 'localhost',
            'port': 5432,
            'database': 'trading_bot',
            'user': 'zhengzefeng',
            'password': 'password',
        }
        
        self.redis_config = redis_config or {
            'host': 'localhost',
            'port': 6379,
        }
        
        # 连接
        self._db = None
        self._redis = None
    
    @property
    def db(self):
        """数据库连接"""
        if self._db is None:
            self._db = psycopg2.connect(**self.db_config)
        return self._db
    
    @property
    def redis(self):
        """Redis 连接"""
        if self._redis is None:
            self._redis = redis.Redis(
                host=self.redis_config['host'],
                port=self.redis_config['port'],
                decode_responses=True
            )
        return self._redis
    
    # ==================== 回测结果管理 ====================
    
    def save_backtest_result(
        self,
        strategy_params: dict,
        metrics: dict,
        symbol: str = None
    ) -> str:
        """
        保存回测结果
        
        Args:
            strategy_params: 策略参数
            metrics: 性能指标
            symbol: 股票代码 (可选)
            
        Returns:
            回测 ID
        """
        # 生成 ID
        import uuid
        backtest_id = f"bt_{uuid.uuid4().hex[:12]}"
        
        cursor = self.db.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            INSERT INTO backtest_runs 
            (id, strategy_params, metrics, symbol, created_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT (id) DO NOTHING
        """, [
            backtest_id,
            json.dumps(strategy_params),
            json.dumps(metrics),
            symbol
        ])
        
        self.db.commit()
        
        # 清除缓存
        self.redis.delete('backtest:latest')
        
        return backtest_id
    
    def load_best_params(self) -> Optional[dict]:
        """
        从记忆获取最优参数
        
        Returns:
            最优策略参数或 None
        """
        # 尝试缓存
        cached = self.redis.get('strategy:best_params')
        if cached:
            return json.loads(cached)
        
        # 从数据库加载
        cursor = self.db.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT strategy_params, metrics
            FROM backtest_runs
            WHERE metrics IS NOT NULL
            ORDER BY 
                (metrics->>'sharpe')::float DESC
            LIMIT 1
        """)
        
        row = cursor.fetchone()
        
        if row:
            params = row['strategy_params']
            # 缓存 1 小时
            self.redis.setex('strategy:best_params', 3600, json.dumps(params))
            return params
        
        return None
    
    def load_recent_results(self, limit: int = 10) -> List[dict]:
        """
        加载最近的回测结果
        """
        # 尝试缓存
        cache_key = f'backtest:recent:{limit}'
        cached = self.redis.get(cache_key)
        if cached:
            return json.loads(cached)
        
        cursor = self.db.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT id, strategy_params, metrics, symbol, created_at
            FROM backtest_runs
            ORDER BY created_at DESC
            LIMIT %s
        """, [limit])
        
        rows = cursor.fetchall()
        
        results = []
        for row in rows:
            results.append({
                'id': row['id'],
                'strategy_params': row['strategy_params'],
                'metrics': row['metrics'],
                'symbol': row['symbol'],
                'created_at': str(row['created_at']),
            })
        
        # 缓存 5 分钟
        self.redis.setex(cache_key, 300, json.dumps(results))
        
        return results
    
    # ==================== 学习动作管理 ====================
    
    def save_learning_action(
        self,
        hypothesis: str,
        confidence: float,
        reasoning: str = None,
        new_params: dict = None
    ) -> str:
        """
        保存学习动作
        """
        import uuid
        action_id = f"la_{uuid.uuid4().hex[:12]}"
        
        cursor = self.db.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            INSERT INTO learning_actions 
            (id, hypothesis, confidence, reasoning, new_params)
            VALUES (%s, %s, %s, %s, %s)
        """, [
            action_id,
            hypothesis,
            confidence,
            reasoning,
            json.dumps(new_params) if new_params else None
        ])
        
        self.db.commit()
        
        return action_id
    
    def load_learning_history(self, days: int = 30) -> List[dict]:
        """加载学习历史"""
        cursor = self.db.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT id, hypothesis, confidence, reasoning, created_at
            FROM learning_actions
            WHERE created_at >= NOW() - INTERVAL '%s days'
            ORDER BY created_at DESC
        """, [days])
        
        return cursor.fetchall()
    
    # ==================== 策略版本管理 ====================
    
    def save_strategy_version(
        self,
        version: str,
        params: dict,
        source: str = 'manual'
    ) -> str:
        """保存策略版本"""
        import uuid
        version_id = f"sv_{uuid.uuid4().hex[:12]}"
        
        cursor = self.db.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            INSERT INTO strategy_versions 
            (id, version, strategy_params, source, status, created_at)
            VALUES (%s, %s, %s, %s, 'active', NOW())
            ON CONFLICT (id) DO UPDATE SET
                strategy_params = EXCLUDED.strategy_params
        """, [
            version_id,
            version,
            json.dumps(params),
            source
        ])
        
        self.db.commit()
        
        return version_id
    
    def load_active_version(self) -> Optional[dict]:
        """加载当前活跃版本"""
        cursor = self.db.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT version, strategy_params
            FROM strategy_versions
            WHERE status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        """)
        
        row = cursor.fetchone()
        
        if row:
            return {
                'version': row['version'],
                'params': row['strategy_params']
            }
        
        return None
    
    # ==================== 缓存管理 ====================
    
    def cache_indicators(
        self,
        symbol: str,
        indicators: dict,
        ttl: int = 3600
    ):
        """缓存指标数据"""
        key = f"indicators:{symbol}"
        self.redis.setex(key, ttl, json.dumps(indicators))
    
    def load_cached_indicators(self, symbol: str) -> Optional[dict]:
        """加载缓存的指标"""
        key = f"indicators:{symbol}"
        cached = self.redis.get(key)
        
        if cached:
            return json.loads(cached)
        
        return None
    
    def clear_cache(self, pattern: str = None):
        """清除缓存"""
        if pattern:
            keys = self.redis.keys(pattern)
            if keys:
                self.redis.delete(*keys)
        else:
            self.redis.flushdb()
    
    # ==================== 数据统计 ====================
    
    def get_statistics(self) -> dict:
        """获取系统统计"""
        cursor = self.db.cursor(cursor_factory=RealDictCursor)
        
        # 回测次数
        cursor.execute("SELECT COUNT(*) as cnt FROM backtest_runs")
        backtest_count = cursor.fetchone()['cnt']
        
        # 学习动作数
        cursor.execute("SELECT COUNT(*) as cnt FROM learning_actions")
        learning_count = cursor.fetchone()['cnt']
        
        # 策略版本数
        cursor.execute("SELECT COUNT(*) as cnt FROM strategy_versions WHERE status = 'active'")
        version_count = cursor.fetchone()['cnt']
        
        return {
            'backtest_count': backtest_count,
            'learning_count': learning_count,
            'active_versions': version_count,
        }
    
    def close(self):
        """关闭连接"""
        if self._db:
            self._db.close()
        if self._redis:
            self._redis.close()


# 导出
__all__ = ['MemoryManager']