import { TradingMarket } from '../types/market';
export interface User {
  id: string;
  discordUserId: string;
  discordUsername: string;
  feishuOpenId?: string;
  feishuUserId?: string;
  feishuUsername?: string;
  email?: string;
  notificationChannels: ('discord' | 'feishu' | 'email')[];
  riskPreference: 'conservative' | 'balanced' | 'aggressive';
  customSinglePositionLimit?: number;
  customTotalPositionLimit?: number;
  customSingleOrderLimit?: number;
  dailySignalLimit: number;
  riskAgreementSigned: boolean;
  riskAgreementSignedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskLimits {
  singlePositionLimit: number;  // 单标的上限 %
  totalPositionLimit: number;   // 总仓位上限 %
  singleOrderLimit: number;     // 单次下单上限 %
}

export const RISK_LIMITS_BY_PREFERENCE: Record<string, RiskLimits> = {
  conservative: { singlePositionLimit: 10, totalPositionLimit: 60, singleOrderLimit: 5 },
  balanced:     { singlePositionLimit: 20, totalPositionLimit: 80, singleOrderLimit: 10 },
  aggressive:   { singlePositionLimit: 30, totalPositionLimit: 95, singleOrderLimit: 20 },
};

export function getRiskLimits(user: User): RiskLimits {
  if (user.customSinglePositionLimit) {
    return {
      singlePositionLimit: user.customSinglePositionLimit,
      totalPositionLimit: user.customTotalPositionLimit!,
      singleOrderLimit: user.customSingleOrderLimit!,
    };
  }
  return RISK_LIMITS_BY_PREFERENCE[user.riskPreference];
}

export interface BrokerAccount {
  id: string;
  userId: string;
  broker: 'futu' | 'longbridge' | 'a_stock';
  encryptedCredentials: string;
  isActive: boolean;
  lastConnectedAt?: Date;
  createdAt: Date;
}

export interface ManualPosition {
  id: string;
  userId: string;
  symbol: string;
  market: TradingMarket;
  quantity: number;
  avgCost?: number;
  updatedAt: Date;
}

