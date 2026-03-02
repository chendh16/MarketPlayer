import { readFileSync } from 'fs';
import path from 'path';
import { getPool } from '../postgres';
import { logger } from '../../utils/logger';

export async function runMigrations(): Promise<void> {
  const migrationFiles = [
    '001_initial_schema.sql',
    '002_signals_orders.sql',
    '003_orders_logs.sql',
    '004_widen_external_id.sql',
  ];

  logger.info('Starting database migrations...');

  for (const file of migrationFiles) {
    const client = await getPool().connect();
    try {
      const sql = readFileSync(
        path.join(__dirname, file),
        'utf8'
      );

      await client.query(sql);
      logger.info(`Migration ${file} applied successfully`);
    } catch (err: any) {
      if (err.code === '42P07') {
        // 表已存在
        logger.info(`Migration ${file} already applied, skipping`);
      } else {
        logger.error(`Migration ${file} failed:`, err);
        throw err;
      }
    } finally {
      client.release();
    }
  }

  logger.info('All migrations completed');
}

