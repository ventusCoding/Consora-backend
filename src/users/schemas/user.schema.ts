import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
export class UserSettings {
  @Prop({ default: 'dark' }) theme: string;
  @Prop({ default: 'en' }) language: string;
  @Prop({ default: true }) pushNotifications: boolean;
  @Prop({ default: false }) emailNotifications: boolean;
}
const UserSettingsSchema = SchemaFactory.createForClass(UserSettings);

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true }) firstName: string;
  @Prop({ required: true }) lastName: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;
  @Prop({ required: true, select: false }) password: string;
  @Prop({ default: '' }) photo: string;
  @Prop({ default: '', maxlength: 280 }) bio: string;
  @Prop({ enum: ['public', 'private'], default: 'public' })
  visibility: 'public' | 'private';
  @Prop({ enum: ['user', 'creator', 'admin'], default: 'user' })
  role: 'user' | 'creator' | 'admin';
  @Prop({ default: false }) isOnline: boolean;
  @Prop({ default: false }) isBanned: boolean;

  // Trust score is computed from completions/fails/social activity.
  @Prop({ default: 50, min: 0, max: 100 }) trustScore: number;

  // Raw counters used by the trust-score formula.
  @Prop({ default: 0 }) completedChallenges: number;
  @Prop({ default: 0 }) failedChallenges: number;
  @Prop({ default: 0 }) likesGiven: number;
  @Prop({ default: 0 }) messagesSent: number;

  // Social: people this user has blocked / starred (GitHub-repo style stars).
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  blockedUsers: Types.ObjectId[];
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  starredUsers: Types.ObjectId[];
  @Prop({ default: 0 }) starsReceived: number;

  @Prop({ type: UserSettingsSchema, default: () => ({}) })
  settings: UserSettings;
}

export const UserSchema = SchemaFactory.createForClass(User);
