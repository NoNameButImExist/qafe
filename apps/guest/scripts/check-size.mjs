// NFR-01: the guest app's JavaScript must stay under 200 KB gzip. Runs after `vite build`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT = 200 * 1024;
const dir = new URL('../dist/assets/', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
const total = files.reduce((sum, f) => sum + gzipSync(readFileSync(join(dir, f))).length, 0);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`guest JS: ${kb(total)} gzip (limit ${kb(LIMIT)}) in ${files.length} file(s)`);
if (total > LIMIT) {
  console.error('NFR-01: guest bundle is over budget');
  process.exit(1);
}
