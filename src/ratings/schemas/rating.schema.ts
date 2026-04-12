import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RatingDocument = HydratedDocument<Rating>;

@Schema({ timestamps: true })
export class Rating {
  @Prop({ type: Types.ObjectId, ref: 'Challenge', required: true, index: true })
  challenge: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 }) score: number;
  @Prop({ default: '' }) comment: string;
}

export const RatingSchema = SchemaFactory.createForClass(Rating);
RatingSchema.index({ challenge: 1, user: 1 }, { unique: true });
