import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChallengeDocument = HydratedDocument<Challenge>;

@Schema({ timestamps: true })
export class Challenge {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) description: string;
  @Prop({ default: '' }) image: string;
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;
  @Prop({ default: '' }) dailyRequirement: string;
  @Prop({ enum: ['easy', 'medium', 'hard'], default: 'easy' })
  difficulty: 'easy' | 'medium' | 'hard';
  @Prop({ default: 'General' }) category: string;
  @Prop({ default: true }) isPublic: boolean;
  @Prop({ default: false }) isPaid: boolean;
  @Prop({ default: 0 }) price: number;
  @Prop({ default: 'USD' }) currency: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creator: Types.ObjectId;

  // Whether the creator is `admin` (free public) or a user-creator.
  @Prop({ enum: ['admin', 'creator'], default: 'admin' })
  creatorType: 'admin' | 'creator';
}

export const ChallengeSchema = SchemaFactory.createForClass(Challenge);
