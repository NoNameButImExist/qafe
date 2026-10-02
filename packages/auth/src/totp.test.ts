import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  totpCode,
  totpUri,
  verifyTotp,
} from './totp.js';

// RFC 6238 appendix B, SHA1 seed "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(totpCode(RFC_SECRET, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(totpCode(RFC_SECRET, Math.floor(20000000000 / 30), 8)).toBe('65353130');
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30))).toBe('287082');
  });

  it('accepts the current step and one either side, returning it', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpCode(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 2), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });

  it('round-trips base32 and builds the otpauth link', () => {
    const bytes = randomBytes(20);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
    expect(totpUri('ABC', 'admin@qafe.ba')).toBe(
      'otpauth://totp/qafe.ba%3Aadmin%40qafe.ba?secret=ABC&issuer=qafe.ba&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('encrypts secrets with AES-GCM and rejects a wrong key', () => {
    const key = randomBytes(32).toString('base64');
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(sealed, key)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decryptSecret(sealed, randomBytes(32).toString('base64'))).toThrow();
    expect(() => encryptSecret('x', 'short')).toThrow();
  });
});
