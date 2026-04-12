import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReportDocument = HydratedDocument<Report>;

@Schema({ timestamps: true })
export class Report {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  reporter: Types.ObjectId;

  // A report can target a user (abuse), a check-in (fake proof), or a challenge.
  @Prop({ enum: ['user', 'checkin', 'challenge'], required: true })
  targetType: 'user' | 'checkin' | 'challenge';

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId;

  @Prop({ required: true }) reason: string;
  @Prop({ default: '' }) details: string;

  @Prop({ enum: ['open', 'reviewed', 'actioned', 'dismissed'], default: 'open' })
  status: 'open' | 'reviewed' | 'actioned' | 'dismissed';
}

export const ReportSchema = SchemaFactory.createForClass(Report);
