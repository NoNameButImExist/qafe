// Generates the Ed25519 key pair used to sign access tokens (EdDSA).
//   pnpm keys:generate            writes secrets/jwt-private.pem and secrets/jwt-public.pem
//   pnpm keys:generate --force    overwrites existing keys (logs everyone out)
// secrets/ is git-ignored. In production the keys come from the secret store, not from this script.

import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'secrets');
const privatePath = join(dir, 'jwt-private.pem');
const publicPath = join(dir, 'jwt-public.pem');

if (existsSync(privatePath) && !process.argv.includes('--force')) {
  console.log(`Keys already exist in ${dir} (use --force to replace them).`);
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey, { mode: 0o644 });
console.log(`Wrote ${privatePath} and ${publicPath}`);
