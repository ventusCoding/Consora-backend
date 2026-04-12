import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ParticipantDocument = HydratedDocument<Participant>;

@Schema({ timestamps: true })
export class Participant {
  @Prop({ type: Types.ObjectId, ref: 'Challenge', required: true, index: true })
  challenge: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({
    enum: ['notStarted', 'inProgress', 'completed', 'failed'],
    default: 'notStarted',
  })
  status: 'notStarted' | 'inProgress' | 'completed' | 'failed';

  @Prop({ default: 0 }) daysCompleted: number;
  @Prop({ default: 0 }) daysMissed: number;
  @Prop() joinedAt: Date;

  // Marks a paid join. Real payment integration pending —
  // TODO: implement Google Pay / Apple Pay charge before flipping this to true.
  @Prop({ default: false }) hasPaid: boolean;
}

export const ParticipantSchema = SchemaFactory.createForClass(Participant);
ParticipantSchema.index({ challenge: 1, user: 1 }, { unique: true });
