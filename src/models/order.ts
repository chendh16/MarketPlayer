export interface Order {
  id: string;
  deliveryId: string;
  userId: string;
  broker: string;
  symbol: string;
  market: 'us' | 'hk' | 'a' | 'btc';
  direction: 'buy' | 'sell';
  quantity: number;
  referencePrice?: number;
  executedPrice?: number;
  status: OrderStatus;
  brokerOrderId?: string;
  failureType?: FailureType;
  failureMessage?: string;
  retryCount: number;
  preOrderRiskCheck?: any;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderStatus =
  | 'pending'
  | 'submitted'
  | 'filled'
  | 'partial_filled'
  | 'failed'
  | 'cancelled';

export type FailureType =
  | 'retryable'
  | 'price_deviation'
  | 'insufficient_funds'
  | 'system_error';

export interface AICostLog {
  id: string;
  callType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  newsItemId?: string;
  userId?: string;
  createdAt: Date;
}

