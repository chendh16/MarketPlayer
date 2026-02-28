import { v4 as uuidv4 } from 'uuid';
import { SignalDelivery } from '../../models/signal';
import {
  getDelivery,
  getSignal,
  updateDeliveryStatus,
  updateSignalDelivery,
  updateAdjustedPositionPct,
} from '../../db/queries';
import { logger } from '../../utils/logger';

// ==================== Result Types ====================

export type ConfirmOrderResult =
  | { kind: 'queued';       orderToken: string }
  | { kind: 'not_found' }
  | { kind: 'wrong_status'; currentStatus: string }
  | { kind: 'token_mismatch' };

export type IgnoreDeliveryResult =
  | { kind: 'ok' }
  | { kind: 'not_found' };

export type AbandonDeliveryResult =
  | { kind: 'ok' }
  | { kind: 'not_found' };

export type AdjustAndConfirmResult =
  | { kind: 'queued';           orderToken: string }
  | { kind: 'validation_error'; message: string }
  | { kind: 'not_found' }
  | { kind: 'wrong_status';     currentStatus: string }
  | { kind: 'token_mismatch' };

export interface CopyTradePayload {
  symbol: string;
  market: string;
  direction: string;
  suggestedPositionPct: number;
  reasoning: string;
}

export type CopyTradeResult =
  | { kind: 'ok';    payload: CopyTradePayload }
  | { kind: 'not_found' };

// ==================== Step Functions ====================

/**
 * Confirms a delivery and enqueues a place-order job.
 *
 * Maps directly to the business logic that was previously inside
 * `confirmOrder()` in `bot.ts`, stripped of all Discord interaction calls.
 */
export async function stepConfirmOrder(
  deliveryId: string,
  inputOrderToken: string,
  overrideWarning: boolean,
): Promise<ConfirmOrderResult> {
  try {
    const delivery: SignalDelivery | null = await getDelivery(deliveryId);
    if (!delivery) {
      return { kind: 'not_found' };
    }

    if (!['pending', 'order_failed'].includes(delivery.status)) {
      return { kind: 'wrong_status', currentStatus: delivery.status };
    }

    if (
      delivery.status === 'pending' &&
      delivery.orderToken &&
      inputOrderToken !== delivery.orderToken
    ) {
      return { kind: 'token_mismatch' };
    }

    let orderToken = delivery.orderToken || inputOrderToken;
    if (delivery.status === 'order_failed') {
      orderToken = uuidv4();
      await updateSignalDelivery(deliveryId, { orderToken });
    }

    await updateDeliveryStatus(deliveryId, 'confirmed', {
      confirmedAt: new Date(),
      overrideRiskWarning: overrideWarning,
      overrideRiskWarningAt: overrideWarning ? new Date() : undefined,
    });

    // Dynamic import to avoid circular dependency:
    // order-queue → order-worker → order-interact → order-queue
    const { orderQueue } = await import('../../queues/order-queue');
    await orderQueue.add('place-order', { deliveryId, orderToken });

    return { kind: 'queued', orderToken };
  } catch (error: unknown) {
    logger.error(`stepConfirmOrder failed for deliveryId=${deliveryId}:`, error);
    throw error;
  }
}

/**
 * Marks a delivery as ignored (user chose not to act on the signal).
 */
export async function stepIgnoreDelivery(
  deliveryId: string,
): Promise<IgnoreDeliveryResult> {
  try {
    const delivery: SignalDelivery | null = await getDelivery(deliveryId);
    if (!delivery) {
      return { kind: 'not_found' };
    }

    await updateDeliveryStatus(deliveryId, 'ignored', { ignoredAt: new Date() });
    return { kind: 'ok' };
  } catch (error: unknown) {
    logger.error(`stepIgnoreDelivery failed for deliveryId=${deliveryId}:`, error);
    throw error;
  }
}

/**
 * Marks a delivery as abandoned (user explicitly gave up on the trade after
 * a warning).  Semantically distinct from ignore; both write 'ignored' status
 * for now but the separation keeps callers decoupled from DB representation.
 */
export async function stepAbandonDelivery(
  deliveryId: string,
): Promise<AbandonDeliveryResult> {
  try {
    const delivery: SignalDelivery | null = await getDelivery(deliveryId);
    if (!delivery) {
      return { kind: 'not_found' };
    }

    await updateDeliveryStatus(deliveryId, 'ignored', { ignoredAt: new Date() });
    return { kind: 'ok' };
  } catch (error: unknown) {
    logger.error(`stepAbandonDelivery failed for deliveryId=${deliveryId}:`, error);
    throw error;
  }
}

/**
 * Validates and applies a position-pct override, then confirms the order.
 *
 * The `positionPctInput` is typed as `unknown` because it may arrive from
 * a Modal text field (string) or an API body (number); this function
 * normalises both.
 */
export async function stepAdjustAndConfirm(
  deliveryId: string,
  orderToken: string,
  positionPctInput: unknown,
): Promise<AdjustAndConfirmResult> {
  const positionPct =
    typeof positionPctInput === 'string'
      ? parseFloat(positionPctInput)
      : Number(positionPctInput);

  if (isNaN(positionPct) || positionPct < 1 || positionPct > 20) {
    return { kind: 'validation_error', message: '请输入 1-20 之间的数字' };
  }

  try {
    const delivery: SignalDelivery | null = await getDelivery(deliveryId);
    if (!delivery) {
      return { kind: 'not_found' };
    }

    if (!['pending', 'order_failed'].includes(delivery.status)) {
      return { kind: 'wrong_status', currentStatus: delivery.status };
    }

    if (
      delivery.status === 'pending' &&
      delivery.orderToken &&
      orderToken !== delivery.orderToken
    ) {
      return { kind: 'token_mismatch' };
    }

    await updateAdjustedPositionPct(deliveryId, positionPct);

    const confirmResult = await stepConfirmOrder(deliveryId, orderToken, false);

    switch (confirmResult.kind) {
      case 'queued':
        return { kind: 'queued', orderToken: confirmResult.orderToken };
      case 'not_found':
        return { kind: 'not_found' };
      case 'wrong_status':
        return { kind: 'wrong_status', currentStatus: confirmResult.currentStatus };
      case 'token_mismatch':
        return { kind: 'token_mismatch' };
    }
  } catch (error: unknown) {
    logger.error(`stepAdjustAndConfirm failed for deliveryId=${deliveryId}:`, error);
    throw error;
  }
}

/**
 * Retrieves the copy-trade payload for a delivery so the caller can format
 * and present it without needing to know about the DB schema.
 */
export async function stepGetCopyTradeInfo(
  deliveryId: string,
): Promise<CopyTradeResult> {
  try {
    const delivery: SignalDelivery | null = await getDelivery(deliveryId);
    if (!delivery) {
      return { kind: 'not_found' };
    }

    const signal = await getSignal(delivery.signalId);
    if (!signal) {
      return { kind: 'not_found' };
    }

    return {
      kind: 'ok',
      payload: {
        symbol: signal.symbol,
        market: signal.market,
        direction: signal.direction,
        suggestedPositionPct: signal.suggestedPositionPct,
        reasoning: signal.reasoning,
      },
    };
  } catch (error: unknown) {
    logger.error(`stepGetCopyTradeInfo failed for deliveryId=${deliveryId}:`, error);
    throw error;
  }
}
