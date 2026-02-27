import { encrypt, decrypt } from '../src/utils/encryption';

describe('Encryption', () => {
  it('should encrypt and decrypt text correctly', () => {
    const originalText = 'test-api-key-12345';
    const encrypted = encrypt(originalText);
    const decrypted = decrypt(encrypted);
    
    expect(encrypted).not.toBe(originalText);
    expect(decrypted).toBe(originalText);
  });

  it('should produce different encrypted values for same input', () => {
    const text = 'same-text';
    const encrypted1 = encrypt(text);
    const encrypted2 = encrypt(text);
    
    // 由于使用固定IV，加密结果应该相同
    expect(encrypted1).toBe(encrypted2);
  });
});

