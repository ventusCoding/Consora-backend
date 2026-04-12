import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { ChatsGateway } from '../chats/chats.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private model: Model<NotificationDocument>,
    private gateway: ChatsGateway,
  ) {}

  async create(
    userId: string,
    data: {
      title: string;
      body?: string;
      type?: 'info' | 'warning' | 'error';
      badge?: string;
      payload?: Record<string, any>;
    },
  ) {
    const doc = await this.model.create({
      user: new Types.ObjectId(userId),
      title: data.title,
      body: data.body || '',
      type: data.type || 'info',
      badge: data.badge || '',
      data: data.payload || {},
    });
    // Realtime push via the chats gateway (single socket server for everything).
    this.gateway.pushToUser(userId, 'notification:new', doc);
    return doc;
  }

  async listForUser(userId: string) {
    return this.model
      .find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
  }

  async markRead(id: string, userId: string) {
    return this.model
      .findOneAndUpdate(
        { _id: id, user: new Types.ObjectId(userId) },
        { isRead: true },
        { new: true },
      )
      .exec();
  }

  async markAllRead(userId: string) {
    await this.model
      .updateMany({ user: new Types.ObjectId(userId), isRead: false }, { isRead: true })
      .exec();
    return { ok: true };
  }
}
