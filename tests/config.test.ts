import { config } from '../src/config';

describe('Configuration', () => {
  it('should load environment variables', () => {
    expect(config).toBeDefined();
    expect(config.NODE_ENV).toBeDefined();
    expect(config.PORT).toBeDefined();
  });

  it('should have required database URLs', () => {
    expect(config.DATABASE_URL).toBeDefined();
    expect(config.REDIS_URL).toBeDefined();
  });

  it('should have encryption keys', () => {
    expect(config.ENCRYPTION_KEY).toBeDefined();
    expect(config.ENCRYPTION_IV).toBeDefined();
    expect(config.ENCRYPTION_KEY).toHaveLength(64);
    expect(config.ENCRYPTION_IV).toHaveLength(32);
  });
});

