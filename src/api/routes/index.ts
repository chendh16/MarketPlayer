import express, { Request, Response } from 'express';
import { query, queryOne } from '../../db/postgres';
import { logger } from '../../utils/logger';

const router = express.Router();

// 健康检查
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 获取用户信息
router.get('/users/:discordUserId', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await queryOne(`
      SELECT * FROM users WHERE discord_user_id = $1
    `, [req.params.discordUserId]);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取用户信号历史
router.get('/users/:userId/signals', async (req: Request, res: Response) => {
  try {
    const signals = await query(`
      SELECT sd.*, s.symbol, s.market, s.direction, s.confidence
      FROM signal_deliveries sd
      JOIN signals s ON sd.signal_id = s.id
      WHERE sd.user_id = $1
      ORDER BY sd.sent_at DESC
      LIMIT 50
    `, [req.params.userId]);
    
    res.json(signals);
  } catch (error) {
    logger.error('Error fetching signals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取AI成本统计
router.get('/admin/costs', async (_req: Request, res: Response) => {
  try {
    const today = await queryOne(`
      SELECT 
        COUNT(*) as call_count,
        SUM(estimated_cost_usd) as total_cost
      FROM ai_cost_logs
      WHERE created_at >= CURRENT_DATE
    `);
    
    const thisMonth = await queryOne(`
      SELECT 
        COUNT(*) as call_count,
        SUM(estimated_cost_usd) as total_cost
      FROM ai_cost_logs
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `);
    
    res.json({
      today,
      thisMonth,
    });
  } catch (error) {
    logger.error('Error fetching costs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
