import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Challenge', required: true, index: true })
  challenge: Types.ObjectId;

  // 'group' = public chat for all participants.
  // 'private' = 1:1 between a paid participant and the creator (coach chat).
  @Prop({ enum: ['group', 'private'], default: 'group', index: true })
  kind: 'group' | 'private';

  // For private chats, this is the non-creator party (participant).
  @Prop({ type: Types.ObjectId, ref: 'User' })
  peer?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  @Prop({ required: true }) text: string;
  @Prop({ default: '' }) imageUrl: string;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
