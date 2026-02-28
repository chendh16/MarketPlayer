import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
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

// Dashboard 静态文件服务（__dirname 编译后为 dist/api/，../../public 指向项目根目录）
app.use('/dashboard', express.static(path.join(__dirname, '../../public')));

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

