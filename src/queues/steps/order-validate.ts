import { SignalDelivery, Signal } from '../../models/signal';
import { User } from '../../models/user';
import { getDelivery, getSignal, getUserById } from '../../db/queries';
import { logger } from '../../utils/logger';

/**
 * Step 2 — Validate that a delivery is in the expected state and that the
 * associated signal and user still exist.
 *
 * Does NOT handle idempotency tokens or distributed locks; those remain the
 * responsibility of the worker layer.
 */
export async function stepValidateDelivery(deliveryId: string): Promise<{
  delivery: SignalDelivery;
  signal: Signal;
  user: User;
}> {
  try {
    const delivery = await getDelivery(deliveryId);

    if (!delivery) {
      throw new Error(`Delivery not found: deliveryId=${deliveryId}`);
    }

    if (delivery.status !== 'confirmed') {
      throw new Error(
        `Delivery ${deliveryId} cannot be processed: expected status 'confirmed', got '${delivery.status}'`
      );
    }

    const signal = await getSignal(delivery.signalId);

    if (!signal) {
      throw new Error(
        `Signal not found for delivery ${deliveryId}: signalId=${delivery.signalId}`
      );
    }

    const user = await getUserById(delivery.userId);

    if (!user) {
      throw new Error(
        `User not found for delivery ${deliveryId}: userId=${delivery.userId}`
      );
    }

    return { delivery, signal, user };
  } catch (error: unknown) {
    logger.error(`stepValidateDelivery failed for deliveryId=${deliveryId}:`, error);
    throw error;
  }
}
