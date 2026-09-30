import { createHash, randomBytes } from 'node:crypto';
import {
  calculateJwkThumbprint,
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWK,
} from 'jose';

export const ACCESS_TOKEN_AUDIENCE = 'qafe-api';
const ALG = 'EdDSA';

type SigningKey = Awaited<ReturnType<typeof importPKCS8>>;
type VerifyingKey = Awaited<ReturnType<typeof importSPKI>>;

export type PlatformRole = 'super_admin' | 'support';

/** Platform staff (admin panel). */
export interface PlatformClaims {
  kind: 'platform';
  userId: string;
  sessionId: string;
  /** Display label for audit entries ("Full Name (email)"). */
  name: string;
  role: PlatformRole;
}

/** Venue staff (panel, staff app). Tenant comes from here on api.qafe.ba. */
export interface StaffClaims {
  kind: 'staff';
  userId: string;
  sessionId: string;
  /** Display label for audit entries ("Full Name (@username)"). */
  name: string;
  venueId: string;
  memberId: string;
  permissions: string[];
}

export type AccessClaims = PlatformClaims | StaffClaims;

interface Payload {
  sid: string;
  nam: string;
  knd: AccessClaims['kind'];
  rol?: PlatformRole;
  vid?: string;
  mid?: string;
  prm?: string[];
}

export class TokenSigner {
  private constructor(
    private readonly key: SigningKey,
    private readonly kid: string,
    private readonly issuer: string,
  ) {}

  static async fromPem(privateKeyPem: string, publicKeyPem: string, issuer: string) {
    const key = await importPKCS8(privateKeyPem, ALG);
    const kid = await calculateJwkThumbprint(await publicJwk(publicKeyPem));
    return new TokenSigner(key, kid, issuer);
  }

  sign(claims: AccessClaims, ttlSeconds: number): Promise<string> {
    const payload: Payload =
      claims.kind === 'platform'
        ? { sid: claims.sessionId, nam: claims.name, knd: 'platform', rol: claims.role }
        : {
            sid: claims.sessionId,
            nam: claims.name,
            knd: 'staff',
            vid: claims.venueId,
            mid: claims.memberId,
            prm: claims.permissions,
          };
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: ALG, kid: this.kid, typ: 'at+jwt' })
      .setSubject(claims.userId)
      .setIssuer(this.issuer)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.key);
  }
}

export class TokenVerifier {
  private constructor(
    private readonly key: VerifyingKey,
    private readonly issuer: string,
  ) {}

  static async fromPem(publicKeyPem: string, issuer: string) {
    return new TokenVerifier(await importSPKI(publicKeyPem, ALG), issuer);
  }

  /** Verifies signature, issuer, audience and expiry. Throws on any failure. */
  async verify(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify<Payload>(token, this.key, {
      algorithms: [ALG],
      issuer: this.issuer,
      audience: ACCESS_TOKEN_AUDIENCE,
      typ: 'at+jwt',
    });
    const userId = payload.sub;
    if (!userId || !payload.sid || typeof payload.nam !== 'string') {
      throw new Error('Invalid token claims');
    }
    const name = payload.nam;

    if (
      payload.knd === 'platform' &&
      (payload.rol === 'super_admin' || payload.rol === 'support')
    ) {
      return { kind: 'platform', userId, sessionId: payload.sid, name, role: payload.rol };
    }
    if (payload.knd === 'staff' && payload.vid && payload.mid && Array.isArray(payload.prm)) {
      return {
        kind: 'staff',
        userId,
        sessionId: payload.sid,
        name,
        venueId: payload.vid,
        memberId: payload.mid,
        permissions: payload.prm,
      };
    }
    throw new Error('Invalid token claims');
  }
}

/** Public key as a JWK for /.well-known/jwks.json. */
export async function publicJwk(publicKeyPem: string): Promise<JWK> {
  const key = await importSPKI(publicKeyPem, ALG, { extractable: true });
  const jwk = await exportJWK(key);
  return { ...jwk, alg: ALG, use: 'sig', kid: await calculateJwkThumbprint(jwk) };
}

/** Opaque refresh token for the client; only its hash is stored (core.auth_sessions). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
