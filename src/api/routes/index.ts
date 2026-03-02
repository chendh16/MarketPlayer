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

// ─── Admin Dashboard 端点 ──────────────────────────────────────────────────────

// 聚合统计数据
router.get('/admin/dashboard/stats', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [news, signals, orders, deliveries] = await Promise.all([
      queryOne(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
          COUNT(*) FILTER (WHERE ai_processed = true)::int AS ai_processed,
          COUNT(*) FILTER (WHERE ai_processed = false)::int AS pending
        FROM news_items
      `),
      queryOne(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
          ROUND(AVG(confidence)::numeric, 1) AS avg_confidence
        FROM signals
      `),
      queryOne(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
          COUNT(*) FILTER (WHERE status = 'filled')::int AS filled,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM orders
      `),
      queryOne(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
        FROM signal_deliveries
      `),
    ]);

    res.json({
      news: {
        total: news?.total ?? 0,
        today: news?.today ?? 0,
        aiProcessed: news?.ai_processed ?? 0,
        pending: news?.pending ?? 0,
      },
      signals: {
        total: signals?.total ?? 0,
        today: signals?.today ?? 0,
        avgConfidence: signals?.avg_confidence ?? 0,
      },
      orders: {
        total: orders?.total ?? 0,
        today: orders?.today ?? 0,
        filled: orders?.filled ?? 0,
        failed: orders?.failed ?? 0,
      },
      deliveries: {
        total: deliveries?.total ?? 0,
        pending: deliveries?.pending ?? 0,
        confirmed: deliveries?.confirmed ?? 0,
        completed: deliveries?.completed ?? 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 资讯列表
router.get('/admin/dashboard/news', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 100);
    const rows = await query(`
      SELECT
        id, title, source, market, symbols,
        ai_summary, ai_processed, ai_processed_at,
        published_at, created_at
      FROM news_items
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    res.json(rows);
  } catch (error) {
    logger.error('Error fetching dashboard news:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 信号列表（含推送统计）
router.get('/admin/dashboard/signals', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 100);
    const rows = await query(`
      SELECT
        s.id, s.symbol, s.market, s.direction,
        s.confidence, s.suggested_position_pct, s.reasoning,
        s.expires_at, s.created_at,
        COUNT(sd.id)::int AS delivery_count,
        COUNT(sd.id) FILTER (WHERE sd.status = 'pending')::int AS pending_count,
        COUNT(sd.id) FILTER (WHERE sd.status = 'completed')::int AS completed_count
      FROM signals s
      LEFT JOIN signal_deliveries sd ON s.id = sd.signal_id
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json(rows);
  } catch (error) {
    logger.error('Error fetching dashboard signals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 推送记录列表（管理员视图）
router.get('/admin/deliveries', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '100')), 500);
    const status = req.query.status as string | undefined;

    const conditions = status ? 'WHERE sd.status = $2' : '';
    const params: (number | string)[] = status ? [limit, status] : [limit];

    const rows = await query(`
      SELECT
        sd.id, sd.sent_at, sd.status,
        sd.adjusted_position_pct, sd.override_risk_warning,
        sd.risk_check_result, sd.confirmed_at, sd.ignored_at,
        u.discord_username,
        s.symbol, s.market, s.direction, s.confidence
      FROM signal_deliveries sd
      JOIN signals s ON sd.signal_id = s.id
      JOIN users u ON sd.user_id = u.id
      ${conditions}
      ORDER BY sd.sent_at DESC
      LIMIT $1
    `, params);

    res.json(rows);
  } catch (error) {
    logger.error('Error fetching admin deliveries:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 用户列表（管理员视图，含信号数和订单数统计）
router.get('/admin/users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '100')), 500);

    const rows = await query(`
      SELECT
        u.id, u.discord_username, u.risk_preference,
        u.custom_single_position_limit, u.custom_total_position_limit,
        u.daily_signal_limit, u.is_active, u.created_at,
        COUNT(DISTINCT sd.id)::int AS signal_count,
        COUNT(DISTINCT o.id)::int  AS order_count
      FROM users u
      LEFT JOIN signal_deliveries sd ON sd.user_id = u.id
      LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json(rows);
  } catch (error) {
    logger.error('Error fetching admin users:', error);
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
