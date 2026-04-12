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
import { ChatsService } from './chats.service';
import { UsersService } from '../users/users.service';

interface AuthedSocket extends Socket {
  userId?: string;
  role?: string;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private chats: ChatsService,
    private jwt: JwtService,
    private users: UsersService,
  ) {}

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
      await this.users.setOnline(payload.sub, true);
      client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    if (client.userId) await this.users.setOnline(client.userId, false);
  }

  @SubscribeMessage('chat:joinGroup')
  joinGroup(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { challengeId: string },
  ) {
    client.join(`group:${data.challengeId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:leaveGroup')
  leaveGroup(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { challengeId: string },
  ) {
    client.leave(`group:${data.challengeId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:joinPrivate')
  joinPrivate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { challengeId: string; participantId: string },
  ) {
    const room = `private:${data.challengeId}:${data.participantId}`;
    client.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage('chat:sendGroup')
  async sendGroup(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { challengeId: string; text: string; imageUrl?: string },
  ) {
    if (!client.userId) return { error: 'unauthorized' };
    const msg = await this.chats.sendGroup(
      data.challengeId,
      client.userId,
      data.text,
      data.imageUrl,
    );
    this.server.to(`group:${data.challengeId}`).emit('chat:groupMessage', msg);
    return { ok: true };
  }

  @SubscribeMessage('chat:sendPrivate')
  async sendPrivate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    data: {
      challengeId: string;
      participantId: string;
      text: string;
      imageUrl?: string;
    },
  ) {
    if (!client.userId) return { error: 'unauthorized' };
    const msg = await this.chats.sendPrivate(
      data.challengeId,
      client.userId,
      data.participantId,
      data.text,
      data.imageUrl,
    );
    const room = `private:${data.challengeId}:${data.participantId}`;
    this.server.to(room).emit('chat:privateMessage', msg);
    return { ok: true };
  }

  @SubscribeMessage('chat:typing')
  typing(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { challengeId: string; kind: 'group' | 'private' },
  ) {
    if (!client.userId) return;
    const room = `${data.kind}:${data.challengeId}`;
    client.to(room).emit('chat:typing', { userId: client.userId });
  }

  /** Helper used by other services to push events to a user. */
  pushToUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
