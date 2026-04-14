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
  // Local-auth password. Optional because social providers (google/apple)
  // can create an account without one.
  @Prop({ required: false, select: false, default: '' }) password: string;
  @Prop({ default: '' }) photo: string;

  // ── Email verification (local provider only) ────────────────────────────
  // Social accounts are considered pre-verified and have emailVerified = true.
  @Prop({ default: false }) emailVerified: boolean;
  // SHA-256 of the raw token we send in the email (we never store the
  // plaintext so a DB leak doesn't expose working verification links).
  @Prop({ default: null, select: false }) emailVerificationTokenHash: string | null;
  @Prop({ default: null }) emailVerificationExpiresAt: Date | null;
  // Used to rate-limit resend: while the *existing* token is still valid we
  // silently no-op instead of generating and mailing a new one.
  @Prop({ default: null }) emailVerificationLastSentAt: Date | null;

  // ── Password reset ──────────────────────────────────────────────────────
  @Prop({ default: null, select: false }) passwordResetTokenHash: string | null;
  @Prop({ default: null }) passwordResetExpiresAt: Date | null;
  @Prop({ default: null }) passwordResetLastSentAt: Date | null;

  // ── Social providers ────────────────────────────────────────────────────
  @Prop({ enum: ['local', 'google', 'apple'], default: 'local' })
  authProvider: 'local' | 'google' | 'apple';
  @Prop({ default: null, index: true, sparse: true }) googleUserId: string | null;
  @Prop({ default: null, index: true, sparse: true }) appleUserId: string | null;
  @Prop({ default: '', maxlength: 280 }) bio: string;
  @Prop({ enum: ['public', 'private'], default: 'public' })
  visibility: 'public' | 'private';
  @Prop({ enum: ['user', 'creator', 'admin'], default: 'user' })
  role: 'user' | 'creator' | 'admin';
  @Prop({ default: false }) isOnline: boolean;
  @Prop({ default: false }) isBanned: boolean;

  // Trust score is computed from completions/fails/social activity.
  // Brand-new users start at 0 and grow it through activity.
  @Prop({ default: 0, min: 0, max: 100 }) trustScore: number;

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
