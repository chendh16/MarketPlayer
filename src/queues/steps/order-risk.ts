import { SignalDelivery, Signal, RiskCheckResult } from '../../models/signal';
import { User } from '../../models/user';
import { AccountSnapshot } from '../../models/position';
import { getManualPositions, updateDeliveryStatus } from '../../db/queries';
import { getAccountSnapshotForOrder } from '../../services/futu/position';
import { config } from '../../config';
import { checkRisk } from '../../services/risk/engine';
import { editMessage } from '../../services/discord/bot';
import { logger } from '../../utils/logger';

export interface RiskStepResult {
  liveSnapshot: AccountSnapshot;
  riskCheck: RiskCheckResult;
}

export async function stepPreOrderRisk(
  user: User,
  signal: Signal,
  delivery: SignalDelivery
): Promise<RiskStepResult> {
  // Step 4: 下单前二次实时拉取持仓（强制不用缓存）
  const liveSnapshot = await getAccountSnapshotForOrder(user.id, config.PREFERRED_BROKER);

  // Step 5: 获取手动持仓，执行二次风控验证
  const manualPositions = await getManualPositions(user.id);

  const riskCheck = await checkRisk({
    user,
    symbol: signal.symbol,
    market: signal.market,
    suggestedPositionPct: delivery.adjustedPositionPct ?? signal.suggestedPositionPct,
    accountSnapshot: liveSnapshot,
    manualPositions,
  });

  // 二次验证不通过 → 更新状态、发通知、抛错终止
  if (riskCheck.status === 'blocked') {
    try {
      await updateDeliveryStatus(delivery.id, 'order_failed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`stepPreOrderRisk: failed to update delivery status for ${delivery.id}: ${msg}`);
    }

    await notifyRiskBlocked(delivery, riskCheck.blockReasons);
    throw new Error(`Risk check blocked for delivery ${delivery.id}`);
  }

  // pass / warning — 正常返回供后续步骤使用
  return { liveSnapshot, riskCheck };
}

async function notifyRiskBlocked(
  delivery: SignalDelivery,
  blockReasons: string[]
): Promise<void> {
  try {
    const ref = getDeliveryMessageRef(delivery);
    if (!ref) return;

    const reasons =
      blockReasons.length > 0
        ? blockReasons.map((r) => `• ${r}`).join('\n')
        : '持仓已超过风控限额';

    await editMessage(ref.channelId, ref.messageId, {
      content: `🚫 **下单已被风控阻止**\n${reasons}\n\n请调整持仓后再试，或联系管理员。`,
      components: [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`notifyRiskBlocked: failed to edit Discord message for delivery ${delivery.id}: ${msg}`);
  }
}

function getDeliveryMessageRef(
  delivery: SignalDelivery & { discord_channel_id?: string; discord_message_id?: string }
): { channelId: string; messageId: string } | null {
  const channelId = String(delivery.discordChannelId ?? delivery.discord_channel_id ?? '');
  const messageId = String(delivery.discordMessageId ?? delivery.discord_message_id ?? '');
  if (!channelId || !messageId) return null;
  return { channelId, messageId };
}
