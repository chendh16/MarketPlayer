import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../../db/postgres';
import { getUserByDiscordId, createUser, getManualPositions } from '../../db/queries';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const router = express.Router();

// ─── JWT 认证中间件 ────────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.JWT_SECRET) as { userId: string; role?: string };
    (req as any).auth = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = (req as any).auth as { userId: string; role?: string } | undefined;
  if (!auth || auth.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ─── 公开端点 ──────────────────────────────────────────────────────────────────

// 健康检查
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 注册用户（Discord Bot 内部调用，需 admin token）
router.post('/users', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { discordUserId, discordUsername, riskPreference } = req.body as {
      discordUserId?: string;
      discordUsername?: string;
      riskPreference?: string;
    };

    if (!discordUserId || !discordUsername) {
      res.status(400).json({ error: 'discordUserId and discordUsername are required' });
      return;
    }

    const existing = await getUserByDiscordId(discordUserId);
    if (existing) {
      res.status(409).json({ error: 'User already exists', user: existing });
      return;
    }

    const user = await createUser({ discordUserId, discordUsername, riskPreference });
    res.status(201).json(user);
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 100);
    const signals = await query(`
      SELECT sd.*, s.symbol, s.market, s.direction, s.confidence, s.suggested_position_pct
      FROM signal_deliveries sd
      JOIN signals s ON sd.signal_id = s.id
      WHERE sd.user_id = $1
      ORDER BY sd.sent_at DESC
      LIMIT $2
    `, [req.params.userId, limit]);

    res.json(signals);
  } catch (error) {
    logger.error('Error fetching signals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取用户持仓（手动持仓）
router.get('/users/:userId/positions', async (req: Request, res: Response) => {
  try {
    const positions = await getManualPositions(req.params.userId);
    res.json(positions);
  } catch (error) {
    logger.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取用户订单历史
router.get('/users/:userId/orders', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 100);
    const orders = await query(`
      SELECT o.*, sd.adjusted_position_pct
      FROM orders o
      LEFT JOIN signal_deliveries sd ON o.delivery_id = sd.id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2
    `, [req.params.userId, limit]);

    res.json(orders);
  } catch (error) {
    logger.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 管理员端点 ────────────────────────────────────────────────────────────────

// 获取AI成本统计
router.get('/admin/costs', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const today = await queryOne(`
      SELECT
        COUNT(*)::int AS call_count,
        ROUND(SUM(estimated_cost_usd)::numeric, 4) AS total_cost_usd
      FROM ai_cost_logs
      WHERE created_at >= CURRENT_DATE
    `);

    const thisMonth = await queryOne(`
      SELECT
        COUNT(*)::int AS call_count,
        ROUND(SUM(estimated_cost_usd)::numeric, 4) AS total_cost_usd
      FROM ai_cost_logs
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    const byCallType = await query(`
      SELECT call_type, COUNT(*)::int AS call_count,
             ROUND(SUM(estimated_cost_usd)::numeric, 4) AS total_cost_usd
      FROM ai_cost_logs
      WHERE created_at >= CURRENT_DATE
      GROUP BY call_type
      ORDER BY total_cost_usd DESC
    `);

    res.json({ today, thisMonth, byCallType });
  } catch (error) {
    logger.error('Error fetching costs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取所有订单（管理员视图）
router.get('/admin/orders', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '100')), 500);
    const status = req.query.status as string | undefined;

    const conditions = status ? 'WHERE o.status = $2' : '';
    const params = status ? [limit, status] : [limit];

    const orders = await query(`
      SELECT o.*, u.discord_username
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ${conditions}
      ORDER BY o.created_at DESC
      LIMIT $1
    `, params);

    res.json(orders);
  } catch (error) {
    logger.error('Error fetching admin orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 生成管理员 token（仅内部使用，需要在环境变量中配置 ADMIN_DISCORD_USER_ID）
router.post('/admin/token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { discordUserId } = req.body as { discordUserId?: string };
    if (!discordUserId || discordUserId !== config.ADMIN_DISCORD_USER_ID) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    const token = jwt.sign(
      { userId: discordUserId, role: 'admin' },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    res.json({ token, expiresIn: config.JWT_EXPIRES_IN });
  } catch (error) {
    logger.error('Error generating admin token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
