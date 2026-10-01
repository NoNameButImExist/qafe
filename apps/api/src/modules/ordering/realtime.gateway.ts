import { Inject, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets';
import type { TokenVerifier } from '@qafe/auth';
import type { GuestServerEvents, StaffServerEvents } from '@qafe/contracts';
import type { Server, Socket } from 'socket.io';
import { TOKEN_VERIFIER } from '../../common/auth/auth.guard.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { VenueDirectory } from '../core/index.js';
import {
  deviceHash,
  GUEST_COOKIE,
  isDeviceId,
  readCookie,
  slugFromHost,
} from './guest-identity.js';
import { OrderingDatabase } from './ordering.database.js';

type Events = GuestServerEvents & StaffServerEvents;

const sessionRoom = (sessionId: string) => `session:${sessionId}`;
const venueRoom = (venueId: string) => `venue:${venueId}`;

/**
 * Live updates (FR-GOS-10, NFR-02). Messages only say "something changed"; clients refetch
 * over HTTP, so nothing is lost if a message is. Guests join their session's room by cookie
 * (the app reconnects after joining a table), staff join their venue's room with an access token. With the Redis adapter every API
 * instance reaches every client.
 */
@WebSocketGateway({ path: '/socket.io', serveClient: false })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server<Record<string, never>, Events>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    private readonly venues: VenueDirectory,
    private readonly db: OrderingDatabase,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = (socket.handshake.auth as { token?: unknown }).token;
      if (typeof token === 'string') {
        const claims = await this.verifier.verify(token);
        if (claims.kind !== 'staff') throw new Error('not staff');
        await socket.join(venueRoom(claims.venueId));
        return;
      }
      await this.subscribeGuest(socket);
    } catch (error) {
      this.logger.debug(`socket rejected: ${String(error)}`);
      socket.disconnect(true);
    }
  }

  /** Tells the table and the venue's staff to refetch. Never throws. */
  sessionChanged(venueId: string, sessionId: string, reason: string): void {
    try {
      this.server.to(sessionRoom(sessionId)).emit('session.changed', { sessionId });
      this.server.to(venueRoom(venueId)).emit('venue.changed', { sessionId, reason });
    } catch (error) {
      this.logger.warn(`realtime emit failed: ${String(error)}`);
    }
  }

  /**
   * Puts a guest socket in the room of the device's active session. A device without a
   * session stays connected without a room: after joining a table the app reconnects, so
   * the handshake carries the new cookie.
   */
  private async subscribeGuest(socket: Socket): Promise<void> {
    const headers = socket.handshake.headers;
    // Traefik keeps the Host header, so the tenant comes from it as on HTTP routes.
    const slug = slugFromHost(headers.host, this.config.guest.domain);
    const deviceId = readCookie(headers.cookie, GUEST_COOKIE);
    const venue = slug ? await this.venues.resolveVenue(slug) : null;
    if (!venue) throw new Error('unknown venue');
    if (!isDeviceId(deviceId)) return;

    const hash = deviceHash(deviceId, this.config.guest.deviceSecret);
    const membership = await this.db.withTenant(
      { venueId: venue.venueId, isSuperAdmin: false },
      (trx) =>
        trx
          .selectFrom('ordering.session_guests')
          .select('session_id')
          .where('device_hash', '=', hash)
          .where('status', 'in', ['pending_approval', 'approved'])
          .executeTakeFirst(),
    );
    if (membership) await socket.join(sessionRoom(membership.session_id));
  }
}
