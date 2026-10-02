import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  can,
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  publicJwk,
  TokenSigner,
  TokenVerifier,
  verifyPassword,
  type AccessClaims,
} from './index.js';

const ISSUER = 'https://api.test';

async function keyPair() {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { extractable: true });
  return { privatePem: await exportPKCS8(privateKey), publicPem: await exportSPKI(publicKey) };
}

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('Admin123!');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Admin123!')).toBe(true);
    expect(await verifyPassword(hash, 'admin123!')).toBe(false);
  });

  it('treats a malformed hash as a failed check', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('access tokens', () => {
  let signer: TokenSigner;
  let verifier: TokenVerifier;
  const admin: AccessClaims = {
    kind: 'platform',
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    name: 'Qafe Admin (admin@qafe.ba)',
    role: 'super_admin',
  };

  beforeAll(async () => {
    const { privatePem, publicPem } = await keyPair();
    signer = await TokenSigner.fromPem(privatePem, publicPem, ISSUER);
    verifier = await TokenVerifier.fromPem(publicPem, ISSUER);
  });

  it('round-trips platform claims', async () => {
    expect(await verifier.verify(await signer.sign(admin, 60))).toEqual(admin);
  });

  it('round-trips staff claims', async () => {
    const staff: AccessClaims = {
      kind: 'staff',
      userId: admin.userId,
      sessionId: admin.sessionId,
      name: 'Selma Begić (@selma)',
      venueId: '33333333-3333-4333-8333-333333333333',
      memberId: '44444444-4444-4444-8444-444444444444',
      permissions: ['orders.view'],
    };
    expect(await verifier.verify(await signer.sign(staff, 60))).toEqual(staff);
  });

  it('rejects a token signed with another key', async () => {
    const other = await keyPair();
    const foreign = await TokenSigner.fromPem(other.privatePem, other.publicPem, ISSUER);
    await expect(verifier.verify(await foreign.sign(admin, 60))).rejects.toThrow();
  });

  it('rejects a tampered token', async () => {
    const [h, p, s] = (await signer.sign(admin, 60)).split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString()) as Record<string, unknown>;
    const forged = Buffer.from(
      JSON.stringify({ ...payload, rol: 'super_admin', sub: 'x' }),
    ).toString('base64url');
    await expect(verifier.verify(`${h}.${forged}.${s}`)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    await expect(verifier.verify(await signer.sign(admin, -10))).rejects.toThrow();
  });

  it('rejects another issuer', async () => {
    const { privatePem, publicPem } = await keyPair();
    const s = await TokenSigner.fromPem(privatePem, publicPem, 'https://evil.test');
    const v = await TokenVerifier.fromPem(publicPem, ISSUER);
    await expect(v.verify(await s.sign(admin, 60))).rejects.toThrow();
  });

  it('exposes the public key as JWK without private parts', async () => {
    const { publicPem } = await keyPair();
    const jwk = await publicJwk(publicPem);
    expect(jwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' });
    expect(jwk).not.toHaveProperty('d');
  });
});

describe('refresh tokens', () => {
  it('are random and stored only as a hash', () => {
    const a = generateRefreshToken();
    expect(a).not.toBe(generateRefreshToken());
    expect(hashRefreshToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(a)).toBe(hashRefreshToken(a));
  });
});

describe('can', () => {
  it('lets super admins through and checks staff permissions', () => {
    const base = { userId: 'u', sessionId: 's', name: 'n' };
    expect(can({ ...base, kind: 'platform', role: 'super_admin' }, 'venue.settings')).toBe(true);
    expect(can({ ...base, kind: 'platform', role: 'support' }, 'venue.settings')).toBe(false);
    const staff = { ...base, kind: 'staff' as const, venueId: 'v', memberId: 'm' };
    expect(can({ ...staff, permissions: ['orders.cancel'] }, 'orders.cancel')).toBe(true);
    expect(can({ ...staff, permissions: [] }, 'orders.cancel')).toBe(false);
  });
});

describe('temporary password flag', () => {
  it('travels in the token only when set', async () => {
    const { privatePem, publicPem } = await keyPair();
    const signer = await TokenSigner.fromPem(privatePem, publicPem, ISSUER);
    const verifier = await TokenVerifier.fromPem(publicPem, ISSUER);
    const claims: AccessClaims = {
      kind: 'platform',
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      name: 'Admin',
      role: 'super_admin',
      mustChangePassword: true,
    };
    expect(await verifier.verify(await signer.sign(claims, 60))).toEqual(claims);
  });
});
