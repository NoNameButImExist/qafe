import { createServer, type Server } from 'node:http';

/**
 * Minimal HTTP server for container health checks.
 * The worker has no public API; this only answers GET /health/live.
 */
export function createHealthServer(): Server {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health/live') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404).end();
  });
}
