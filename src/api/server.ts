import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import routes from './routes';

const app = express();

// CORS 配置 — 白名单模式，生产环境通过 CORS_ORIGINS 环境变量配置实际域名
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, cb) => {
    // 允许无 Origin 头的请求（curl、服务端调用等）
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// 请求追踪日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Dashboard 静态文件服务（__dirname 编译后为 dist/api/，../../public 指向项目根目录）
app.use('/dashboard', express.static(path.join(__dirname, '../../public')));
// 共享前端 JS 模块（dashboard.html 中绝对路径 /js/ 引用）
app.use('/js', express.static(path.join(__dirname, '../../public/js')));

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

