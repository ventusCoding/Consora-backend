import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) body: string;

  @Prop({ enum: ['info', 'warning', 'error'], default: 'info' })
  type: 'info' | 'warning' | 'error';

  @Prop({ default: false }) isRead: boolean;
  @Prop({ default: '' }) badge: string;
  @Prop({ type: Object, default: {} }) data: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
