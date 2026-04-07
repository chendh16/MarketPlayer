"""
backtester.py - 向量化回测引擎

策略逻辑 (与原实现完全一致):
- 入场: RSI < rsi_oversold AND ma_fast > ma_slow
- 出场: 止损/止盈/持仓天数
"""

import numpy as np
from typing import List


class Trade:
    def __init__(self, symbol, entry_date, exit_date, entry_price, exit_price, direction, pnl, pnl_pct, hold_days):
        self.symbol = symbol
        self.entry_date = entry_date
        self.exit_date = exit_date
        self.entry_price = entry_price
        self.exit_price = exit_price
        self.direction = direction
        self.pnl = pnl
        self.pnl_pct = pnl_pct
        self.hold_days = hold_days


class BacktestResult:
    def __init__(self, symbol, trade_count, trades, total_return, sharpe, max_drawdown, win_rate, avg_win, avg_loss, profit_factor, avg_hold_days):
        self.symbol = symbol
        self.trade_count = trade_count
        self.trades = trades
        self.total_return = total_return
        self.sharpe = sharpe
        self.max_drawdown = max_drawdown
        self.win_rate = win_rate
        self.avg_win = avg_win
        self.avg_loss = avg_loss
        self.profit_factor = profit_factor
        self.avg_hold_days = avg_hold_days


class StrategyParams:
    def __init__(self, ma_short=11, ma_long=30, rsi_period=14, rsi_oversold=35, rsi_overbought=65, stop_loss_pct=0.05, profit_target_pct=0.12, max_hold_days=10):
        self.ma_short = ma_short
        self.ma_long = ma_long
        self.rsi_period = rsi_period
        self.rsi_oversold = rsi_oversold
        self.rsi_overbought = rsi_overbought
        self.stop_loss_pct = stop_loss_pct
        self.profit_target_pct = profit_target_pct
        self.max_hold_days = max_hold_days


class VectorizedBacktester:
    """向量化回测引擎 (RSI + MA 策略)"""

    def __init__(self, params=None):
        self.params = params or StrategyParams()

    def run(self, klines_dict, indicators_dict):
        results = {}

        for symbol, klines in klines_dict.items():
            if symbol not in indicators_dict:
                continue

            ind = indicators_dict[symbol]
            close = klines.close

            # 获取指标
            ma_fast_key = f"ma{self.params.ma_short}"
            ma_slow_key = f"ma{self.params.ma_long}"
            rsi_key = f"rsi{self.params.rsi_period}"

            ma_fast = ind.get(ma_fast_key)
            ma_slow = ind.get(ma_slow_key)
            rsi = ind.get(rsi_key)

            if ma_fast is None or ma_slow is None or rsi is None:
                continue

            # RSI + MA 策略
            trades = self._backtest_rsi_ma(
                close, klines.timestamps,
                rsi, ma_fast, ma_slow,
                self.params.stop_loss_pct,
                self.params.profit_target_pct,
                self.params.max_hold_days
            )

            result = self._calculate_result(symbol, trades)
            results[symbol] = result

        return results
    
    def _backtest_rsi_ma(self, close, timestamps, rsi, ma_fast, ma_slow, stop_loss, profit_target, max_hold):
        """RSI + MA 策略回测 (与原实现一致)"""
        n = len(close)

        trades = []

        in_position = False
        position_entry_idx = 0
        position_entry_price = 0.0

        for i in range(1, n):
            # 跳过 NaN
            if np.isnan(rsi[i]) or np.isnan(ma_fast[i]) or np.isnan(ma_slow[i]):
                continue

            # 入场条件: RSI < rsi_oversold AND ma_fast > ma_slow
            if not in_position:
                if rsi[i] < self.params.rsi_oversold and ma_fast[i] > ma_slow[i]:
                    in_position = True
                    position_entry_idx = i
                    position_entry_price = close[i]

            elif in_position:
                hold_days = i - position_entry_idx
                pnl_pct = (close[i] - position_entry_price) / position_entry_price

                should_exit = False

                # 出场条件
                if pnl_pct <= -stop_loss:
                    should_exit = True
                elif pnl_pct >= profit_target:
                    should_exit = True
                elif hold_days >= max_hold:
                    should_exit = True

                if should_exit:
                    pnl = close[i] - position_entry_price

                    trade = Trade(
                        symbol='',
                        entry_date=i,
                        exit_date=i,
                        entry_price=position_entry_price,
                        exit_price=close[i],
                        direction='long',
                        pnl=pnl,
                        pnl_pct=pnl_pct * 100,
                        hold_days=hold_days
                    )

                    trades.append(trade)
                    in_position = False

        # 最后持仓平仓
        if in_position:
            pnl = close[-1] - position_entry_price
            trade = Trade(
                symbol='',
                entry_date=position_entry_idx,
                exit_date=n-1,
                entry_price=position_entry_price,
                exit_price=close[-1],
                direction='long',
                pnl=pnl,
                pnl_pct=(pnl / position_entry_price) * 100,
                hold_days=max_hold
            )
            trades.append(trade)

        return trades
    
    def _calculate_result(self, symbol, trades):
        """计算结果"""
        if not trades:
            return BacktestResult(symbol, 0, [], 0, 0, 0, 0, 0, 0, 0, 0)
        
        pnls = [t.pnl_pct for t in trades]
        
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]
        
        win_rate = len(wins) / len(pnls) * 100 if pnls else 0
        avg_win = sum(wins) / len(wins) if wins else 0
        avg_loss = abs(sum(losses) / len(losses)) if losses else 0
        profit_factor = avg_win / avg_loss if avg_loss > 0 else 0
        
        total_return = sum(pnls)
        
        if len(pnls) > 1:
            mean_pnl = np.mean(pnls)
            std_pnl = np.std(pnls)
            sharpe = mean_pnl / std_pnl * np.sqrt(252 / 20) if std_pnl > 0 else 0
        else:
            sharpe = 0
        
        avg_hold = sum(t.hold_days for t in trades) / len(trades) if trades else 0
        
        return BacktestResult(
            symbol=symbol,
            trade_count=len(trades),
            trades=trades,
            total_return=total_return,
            sharpe=sharpe,
            max_drawdown=0,
            win_rate=win_rate,
            avg_win=avg_win,
            avg_loss=avg_loss,
            profit_factor=profit_factor,
            avg_hold_days=int(avg_hold)
        )
    
    def run_summary(self, results):
        return {
            'total_trades': sum(r.trade_count for r in results.values()),
            'total_symbols': len(results),
            'avg_return': sum(r.total_return for r in results.values()) / len(results) if results else 0,
            'avg_sharpe': sum(r.sharpe for r in results.values()) / len(results) if results else 0,
        }


__all__ = ['VectorizedBacktester', 'StrategyParams', 'BacktestResult', 'Trade']