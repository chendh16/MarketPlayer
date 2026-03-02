import cron from 'node-cron';
import { query } from '../../db/postgres';
import { redisClient } from '../../db/redis';
import { editMessage } from '../discord/bot';
import { logger } from '../../utils/logger';

// 构建失效消息
function buildExpiredMessage() {
  return {
    content: '⏱️ 本参考已失效',
    embeds: [{
      color: 0x888888,
      title: '⏱️ 参考已失效',
      description: '本参考已超过15分钟未确认，市场行情可能已发生变化，请重新评估。',
    }],
    components: [],
  };
}

// 每分钟检查一次过期的 delivery
export function startExpiryChecker() {
  cron.schedule('* * * * *', async () => {
    try {
      const expiredDeliveries = await query(`
        SELECT * FROM signal_deliveries
        WHERE status = 'pending'
          AND sent_at < NOW() - INTERVAL '15 minutes'
      `);
      
      for (const delivery of expiredDeliveries) {
        // 更新状态
        await query(`
          UPDATE signal_deliveries 
          SET status = 'expired', expired_at = NOW() 
          WHERE id = $1
        `, [delivery.id]);
        
        // 编辑 Discord 消息
        if (delivery.discord_message_id && delivery.discord_channel_id) {
          await editMessage(
            delivery.discord_channel_id,
            delivery.discord_message_id,
            buildExpiredMessage()
          );
        }

        // 清理 Redis orderToken key（防止 token 卡在 'processing' 或 24h TTL 滞留）
        if (delivery.order_token) {
          await redisClient.del(`order:token:${delivery.order_token}`);
        }

        logger.info(`Delivery ${delivery.id} expired`);
      }
      
      if (expiredDeliveries.length > 0) {
        logger.info(`Processed ${expiredDeliveries.length} expired deliveries`);
      }
    } catch (error) {
      logger.error('Error in expiry checker:', error);
    }
  });
  
  logger.info('Expiry checker started');
}
