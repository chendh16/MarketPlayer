export interface Signal {
  id: string;
  newsItemId?: string;
  symbol: string;
  market: 'us' | 'hk' | 'a' | 'btc';
  direction: 'long' | 'short';
  confidence: number;           // 0-100
  suggestedPositionPct: number;
  reasoning: string;
  status: 'generated' | 'sent' | 'expired' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
}

export interface SignalDelivery {
  id: string;
  signalId: string;
  userId: string;
  discordMessageId?: string;
  discordChannelId?: string;
  orderToken: string;
  riskCheckResult: RiskCheckResult;
  status: DeliveryStatus;
  confirmedAt?: Date;
  ignoredAt?: Date;
  expiredAt?: Date;
  overrideRiskWarning: boolean;
  overrideRiskWarningAt?: Date;
  adjustedPositionPct?: number;
  sentAt: Date;
}

export type DeliveryStatus =
  | 'pending'
  | 'sent'
  | 'confirmed'
  | 'ignored'
  | 'expired'
  | 'order_placed'
  | 'order_failed'
  | 'completed';

export interface RiskCheckResult {
  status: 'pass' | 'warning' | 'blocked';
  currentSinglePositionPct: number;
  projectedSinglePositionPct: number;
  currentTotalPositionPct: number;
  projectedTotalPositionPct: number;
  availableCash: number;
  singlePositionLimit: number;
  totalPositionLimit: number;
  warningMessages: string[];
  blockReasons: string[];
  dataSource: 'live' | 'cache';
  checkedAt: Date;
  coverageNote: string;
}

export interface NewsItem {
  id: string;
  source: string;
  externalId?: string;
  title: string;
  content?: string;
  url?: string;
  market: 'us' | 'hk' | 'a' | 'btc';
  symbols?: string[];
  triggerType?: string;
  aiSummary?: string;
  aiImpactAnalysis?: string;
  aiProcessed: boolean;
  aiProcessedAt?: Date;
  publishedAt: Date;
  createdAt: Date;
}

