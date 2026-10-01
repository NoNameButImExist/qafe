import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Redis } from '@qafe/redis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO over Redis pub/sub, so a message emitted on one API instance reaches clients
 * connected to any other. Channels are prefixed like every other key.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly pub: Redis;
  private readonly sub: Redis;

  constructor(
    app: INestApplicationContext,
    redis: Redis,
    private readonly corsOrigins: string[],
  ) {
    super(app);
    this.pub = redis.duplicate();
    this.sub = redis.duplicate();
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      path: options?.path ?? '/socket.io',
      cors: { origin: this.corsOrigins, credentials: true },
    } as ServerOptions);
    server.adapter(createAdapter(this.pub, this.sub, { key: 'qafe:realtime' }));
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    this.pub.disconnect();
    this.sub.disconnect();
  }
}
