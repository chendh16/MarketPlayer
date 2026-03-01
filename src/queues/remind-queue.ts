import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';

const connection = { host: 'localhost', port: 6379 };

interface RemindJobData {
  deliveryId: string;
  discordUserId: string; // Discord user ID（非 DB UUID），直接用于发 DM
}

export const remindQueue = new Queue('remind', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 200,
  },
});

export const remindWorker = new Worker<RemindJobData>(
  'remind',
  async (job: Job<RemindJobData>) => {
    const { deliveryId, discordUserId } = job.data;

    // 动态 import 打破循环依赖：bot.ts → remind-queue.ts → bot.ts
    const { getDelivery } = await import('../db/queries');
    const delivery = await getDelivery(deliveryId);

    if (!delivery || delivery.status !== 'pending') {
      logger.info(`Remind skipped: delivery=${deliveryId} status=${delivery?.status ?? 'not_found'}`);
      return;
    }

    const { discordClient } = await import('../services/discord/bot');
    const user = await discordClient.users.fetch(discordUserId);
    const dm = await user.createDM();
    await dm.send({
      content: '⏰ **30分钟提醒**\n您之前设置了对信号的提醒，该信号仍待您处理。\n请点击原始消息中的按钮操作，或忽略。',
    });

    logger.info(`Remind sent: delivery=${deliveryId}`);
  },
  { connection, concurrency: 5 }
);

remindWorker.on('failed', (job, err) => {
  logger.error(`Remind job ${job?.id} failed:`, err);
});
