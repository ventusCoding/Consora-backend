import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

interface AuthedSocket extends Socket {
  userId?: string;
  role?: string;
}

/**
 * Live tracking gateway. Pushes real-time events (check-ins, day-missed,
 * progress updates) to subscribed clients. Rooms:
 *   - `live:user:{userId}`       — the user's personal feed
 *   - `live:challenge:{id}`      — every participant of a challenge
 *
 * Other services call `emitCheckin`, `emitDayMissed`, `emitProgress` on
 * this gateway when state changes.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private jwt: JwtService) {}

  async handleConnection(client: AuthedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.headers.authorization || '').replace('Bearer ', '');
      if (!token) return client.disconnect(true);
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'dev-secret',
      });
      client.userId = payload.sub;
      client.role = payload.role;
      client.join(`live:user:${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: AuthedSocket) {}

  @SubscribeMessage('live:follow')
  follow(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { challengeId: string },
  ) {
    if (!data?.challengeId) return { error: 'missing challengeId' };
    client.join(`live:challenge:${data.challengeId}`);
    return { ok: true };
  }

  @SubscribeMessage('live:unfollow')
  unfollow(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { challengeId: string },
  ) {
    if (!data?.challengeId) return { error: 'missing challengeId' };
    client.leave(`live:challenge:${data.challengeId}`);
    return { ok: true };
  }

  /** Called by CheckinsService after a successful submission. */
  emitCheckin(payload: {
    challengeId: string;
    userId: string;
    dayNumber: number;
    status: string;
    createdAt: Date;
  }) {
    this.server
      .to(`live:challenge:${payload.challengeId}`)
      .emit('live:checkin', payload);
    this.server.to(`live:user:${payload.userId}`).emit('live:checkin', payload);
  }

  /** Called when a user misses a day. */
  emitDayMissed(payload: {
    challengeId: string;
    userId: string;
    dayNumber: number;
  }) {
    this.server
      .to(`live:challenge:${payload.challengeId}`)
      .emit('live:dayMissed', payload);
    this.server
      .to(`live:user:${payload.userId}`)
      .emit('live:dayMissed', payload);
  }

  /** Called when progress changes (days completed/missed counters). */
  emitProgress(payload: {
    challengeId: string;
    userId: string;
    daysCompleted: number;
    daysMissed: number;
  }) {
    this.server
      .to(`live:challenge:${payload.challengeId}`)
      .emit('live:progress', payload);
    this.server
      .to(`live:user:${payload.userId}`)
      .emit('live:progress', payload);
  }
}
