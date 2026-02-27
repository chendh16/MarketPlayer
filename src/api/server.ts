import express from 'express';
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

export async function startAPIServer(): Promise<void> {
  return new Promise((resolve) => {
    app.listen(config.PORT, () => {
      logger.info(`API server listening on port ${config.PORT}`);
      resolve();
    });
  });
}

export { app };

