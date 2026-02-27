import { getRiskLimits, RISK_LIMITS_BY_PREFERENCE } from '../src/models/user';
import { User } from '../src/models/user';

describe('Risk Limits', () => {
  it('should return correct limits for conservative preference', () => {
    const user: User = {
      id: '1',
      discordUserId: '123',
      discordUsername: 'test',
      riskPreference: 'conservative',
      dailySignalLimit: 20,
      riskAgreementSigned: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const limits = getRiskLimits(user);
    expect(limits.singlePositionLimit).toBe(10);
    expect(limits.totalPositionLimit).toBe(60);
    expect(limits.singleOrderLimit).toBe(5);
  });

  it('should use custom limits when provided', () => {
    const user: User = {
      id: '1',
      discordUserId: '123',
      discordUsername: 'test',
      riskPreference: 'balanced',
      customSinglePositionLimit: 15,
      customTotalPositionLimit: 70,
      customSingleOrderLimit: 8,
      dailySignalLimit: 20,
      riskAgreementSigned: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const limits = getRiskLimits(user);
    expect(limits.singlePositionLimit).toBe(15);
    expect(limits.totalPositionLimit).toBe(70);
    expect(limits.singleOrderLimit).toBe(8);
  });

  it('should have all risk preferences defined', () => {
    expect(RISK_LIMITS_BY_PREFERENCE.conservative).toBeDefined();
    expect(RISK_LIMITS_BY_PREFERENCE.balanced).toBeDefined();
    expect(RISK_LIMITS_BY_PREFERENCE.aggressive).toBeDefined();
  });
});

