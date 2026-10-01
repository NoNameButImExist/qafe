import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** packages/db/migrations (same relative path from src/ and dist/). */
export const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

/** The `-- migrate:up` part of every dbmate migration, in order. Used by tests. */
export async function readUpMigrations(dir = migrationsDir): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (file) => {
      const text = await readFile(join(dir, file), 'utf8');
      const up = text.split(/^-- migrate:up\s*$/m)[1];
      if (up === undefined) throw new Error(`${file}: missing "-- migrate:up"`);
      return up.split(/^-- migrate:down\s*$/m)[0] ?? up;
    }),
  );
}
