import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CheckinDocument = HydratedDocument<Checkin>;

@Schema({ timestamps: true })
export class Checkin {
  @Prop({ type: Types.ObjectId, ref: 'Challenge', required: true, index: true })
  challenge: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true }) dayNumber: number;
  @Prop({ required: true }) videoUrl: string;
  @Prop({ default: '' }) caption: string;

  @Prop({
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved',
  })
  status: 'pending' | 'approved' | 'rejected';

  // Who approved/rejected it (admin, or system auto-approval marker).
  @Prop({ default: 'system' }) reviewedBy: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  likes: Types.ObjectId[];

  @Prop({ default: 0 }) likesCount: number;
  @Prop({ default: 0 }) reportsCount: number;
}

export const CheckinSchema = SchemaFactory.createForClass(Checkin);
CheckinSchema.index({ challenge: 1, user: 1, dayNumber: 1 }, { unique: true });
