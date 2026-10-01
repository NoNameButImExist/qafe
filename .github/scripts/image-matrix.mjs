// Builds the GitHub Actions matrix of Docker images to build.
//
//   node .github/scripts/image-matrix.mjs affected   # CI: apps changed since TURBO_SCM_BASE
//   node .github/scripts/image-matrix.mjs released   # Release: apps release-please just released
//
// Prints `images=<json>` for $GITHUB_OUTPUT. Each entry: { app, dockerfile, version? }.

import { execFileSync } from 'node:child_process';

// Deployable apps and their Dockerfile. Workspace packages have no image of their own (a
// change there reaches the images through turbo or node-workspace bumps), except packages/db:
// its migrations ship as the "migrate" image.
const IMAGES = {
  'apps/api': 'infra/docker/service.Dockerfile',
  'apps/worker': 'infra/docker/service.Dockerfile',
  'apps/guest': 'infra/docker/web.Dockerfile',
  'apps/staff': 'infra/docker/web.Dockerfile',
  'apps/panel': 'infra/docker/web.Dockerfile',
  'apps/admin': 'infra/docker/web.Dockerfile',
  'apps/web': 'infra/docker/web.Dockerfile',
  'packages/db': 'infra/docker/migrate.Dockerfile',
};
const NAMES = { 'packages/db': 'migrate' };

const entry = (path, extra = {}) => ({
  app: NAMES[path] ?? path.split('/')[1],
  dockerfile: IMAGES[path],
  ...extra,
});

function affected() {
  const base = process.env.TURBO_SCM_BASE;
  // No usable base (first push of a branch): build everything.
  if (!base || /^0+$/.test(base)) return Object.keys(IMAGES).map((p) => entry(p));

  const head = process.env.TURBO_SCM_HEAD || 'HEAD';
  const changedFiles = execFileSync('git', ['diff', '--name-only', base, head], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  // A Dockerfile or nginx change affects every image built from it.
  const changedDockerfiles = new Set(changedFiles.filter((f) => f.startsWith('infra/docker/')));
  const touchesAllImages = changedDockerfiles.has('infra/docker/nginx.conf');

  const out = execFileSync('pnpm', ['exec', 'turbo', 'ls', '--affected', '--output=json'], {
    encoding: 'utf8',
  });
  const affectedPaths = new Set(JSON.parse(out).packages.items.map((p) => p.path));

  return Object.keys(IMAGES)
    .filter(
      (p) =>
        affectedPaths.has(p) ||
        changedDockerfiles.has(IMAGES[p]) ||
        (touchesAllImages && IMAGES[p].endsWith('web.Dockerfile')),
    )
    .map((p) => entry(p));
}

function released() {
  const outputs = JSON.parse(process.env.RELEASE_OUTPUTS || '{}');
  const paths = JSON.parse(outputs.paths_released || '[]');
  return paths
    .filter((p) => p in IMAGES)
    .map((p) => entry(p, { version: outputs[`${p}--version`] }));
}

const mode = process.argv[2];
const images = mode === 'affected' ? affected() : mode === 'released' ? released() : null;
if (!images) {
  console.error('Usage: image-matrix.mjs <affected|released>');
  process.exit(1);
}
console.log(`images=${JSON.stringify(images)}`);
