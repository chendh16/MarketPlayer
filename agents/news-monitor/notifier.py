"""
NewsNotifier - Agent 通知服务
"""

import subprocess
import json
from typing import Dict


class NewsNotifier:
    async def notify(self, news_title: str, alert_level: int, affected_symbols: list):
        """
        根据 alert_level 通知 agents

        规则:
        - CRITICAL (1): 立即通知 market-agent + quant-agent + risk-agent
        - HIGH (2): 5分钟内通知 market-agent + quant-agent
        - MEDIUM (3): 加入当日简报
        - LOW (4): 仅存档
        """
        if alert_level == 1:  # CRITICAL
            agents = ['market-agent', 'quant-agent', 'risk-agent']
            message = f"🔴 紧急新闻: {news_title}\n受影响股票: {', '.join(affected_symbols)}"
            for agent_id in agents:
                await self.call_agent(agent_id, message)
        elif alert_level == 2:  # HIGH
            agents = ['market-agent', 'quant-agent']
            message = f"🟠 重要新闻: {news_title}\n受影响股票: {', '.join(affected_symbols)}"
            for agent_id in agents:
                await self.call_agent(agent_id, message)
        # MEDIUM 和 LOW 不立即通知

    async def call_agent(self, agent_id: str, message: str) -> Dict:
        """
        调用 OpenClaw Gateway 通知 agent
        """
        try:
            cmd = ['openclaw', 'agent', '--agent', agent_id, '--message', message, '--json']
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                return {'success': True, 'agent': agent_id}
            else:
                return {'success': False, 'agent': agent_id, 'error': result.stderr}
        except Exception as e:
            return {'success': False, 'agent': agent_id, 'error': str(e)}
