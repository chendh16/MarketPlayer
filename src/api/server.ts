import express, { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import routes from './routes';

const app = express();

app.use(express.json());

// 日志中间件
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// 路由
app.use('/api', routes);

// 全局错误处理中间件（必须在路由之后）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled API error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export async function startAPIServer(): Promise<void> {
  return new Promise((resolve) => {
    app.listen(config.PORT, () => {
      logger.info(`API server listening on port ${config.PORT}`);
      resolve();
    });
  });
}

export { app };

