/**
 * 短线策略配置管理
 * 从记忆文件读取参数配置
 * 支持v2优化参数格式
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ShortTermConfig {
  // 策略参数
  fast_period: number;
  slow_period: number;
  rsi_period: number;
  rsi_low: number;
  rsi_high: number;
  atr_multiplier: number;
  adx_threshold: number;
  min_score: number;
  stop_loss_pct: number | string;
  stop_loss_atr_multiplier: number;
  stop_loss_cap: number;
  profit_target_pct: number;
  max_hold_days: number;
  
  // 退出规则
  day5_rule: string;
  day5_rule_note: string;
  stop_loss_type: string;
  
  // 市场过滤
  market_filter: {
    US: string;
    CN: string;
    HK: string;
  };
  
  // 评分规则
  score_rules: {
    breakout_volume: number;
    ma_aligned: number;
    rsi_bounce: number;
    pullback_support: number;
    volume_3days: number;
    market_above_ma20: number;
    min_entry_score: number;
  };
  
  // 仓位管理
  position_sizing: {
    total_capital: number;
    max_single_position: number;
    max_concurrent_positions: number;
  };
  
  // 持股天数规则
  hold_days_by_score: {
    "80+": number;
    "70-79": number;
    "65-69": number;
  };
  
  // 模拟状态
  simulation_status: {
    is_live: boolean;
    mode: string;
    param_version: string;
  };
  
  // 运行状态
  运行状态: {
    status: string;
    start_date: string;
    trading_days: number;
    initial_cash: number;
    current_cash: number;
    position_value: number;
    total_assets: number;
    累计收益: number;
    收益比例: number;
    本月胜率: string;
    本月交易次数: number;
    consecutive_loss_count: number;
    weekly_drawdown: number;
    no_signal_count: number;
  };
}

let cachedConfig: ShortTermConfig | null = null;

/**
 * 读取短线策略配置
 */
export function loadShortTermConfig(): ShortTermConfig {
  // 清除缓存，强制重新读取
  cachedConfig = null;
  
  const configPath = path.join(process.cwd(), 'memory', 'short-term-sim.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const jsonStr = content.replace(/^#.*$/gm, '').replace(/```json/, '').replace(/```/, '').trim();
      const rawConfig = JSON.parse(jsonStr);
      
      // 兼容新旧格式
      if (rawConfig.strategy_params) {
        // v2优化格式
        cachedConfig = {
          ...rawConfig.strategy_params,
          ...rawConfig.exit_rules,
          market_filter: rawConfig.market_filter,
          score_rules: rawConfig.score_rules,
          position_sizing: rawConfig.position_sizing,
          hold_days_by_score: rawConfig.hold_days_by_score,
          simulation_status: rawConfig.simulation_status,
          运行状态: rawConfig.运行状态,
        };
      } else {
        // 旧格式
        cachedConfig = rawConfig;
      }
      
      console.log('[Config] ✅ 已加载短线策略配置 v2');
      console.log(`[Config] 参数版本: ${cachedConfig!.simulation_status?.param_version || 'unknown'}`);
      return cachedConfig!;
    }
  } catch (e) {
    console.error('[Config] ❌ 加载配置失败:', e);
  }
  
  return getDefaultConfig();
}

/**
 * 清除配置缓存
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * 获取默认配置
 */
function getDefaultConfig(): ShortTermConfig {
  return {
    fast_period: 11,
    slow_period: 30,
    rsi_period: 14,
    rsi_low: 35,
    rsi_high: 65,
    atr_multiplier: 1.5,
    adx_threshold: 25,
    min_score: 65,
    stop_loss_pct: 'dynamic_atr',
    stop_loss_atr_multiplier: 2.0,
    stop_loss_cap: 0.06,
    profit_target_pct: 0.12,
    max_hold_days: 10,
    day5_rule: '持仓第5天盈利 < 8% 提前平仓',
    day5_rule_note: '条件触发，不是无条件平仓',
    stop_loss_type: 'dynamic_atr',
    market_filter: {
      US: 'SPY收盘价在MA20之上才允许开仓',
      CN: '沪深300在MA20之上才允许开仓',
      HK: '恒生指数在MA20之上才允许开仓',
    },
    score_rules: {
      breakout_volume: 25,
      ma_aligned: 15,
      rsi_bounce: 15,
      pullback_support: 15,
      volume_3days: 10,
      market_above_ma20: 10,
      min_entry_score: 65,
    },
    position_sizing: {
      total_capital: 100000,
      max_single_position: 20000,
      max_concurrent_positions: 5,
    },
    hold_days_by_score: {
      '80+': 5,
      '70-79': 4,
      '65-69': 3,
    },
    simulation_status: {
      is_live: false,
      mode: 'simulation',
      param_version: 'v2_default',
    },
    运行状态: {
      status: '未启动',
      start_date: new Date().toISOString().split('T')[0],
      trading_days: 0,
      initial_cash: 100000,
      current_cash: 100000,
      position_value: 0,
      total_assets: 100000,
      累计收益: 0,
      收益比例: 0,
      本月胜率: '0%',
      本月交易次数: 0,
      consecutive_loss_count: 0,
      weekly_drawdown: 0,
      no_signal_count: 0,
    },
  };
}