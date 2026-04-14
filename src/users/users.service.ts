import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private model: Model<UserDocument>) {}

  async findByEmail(email: string, withPassword = false) {
    const q = this.model.findOne({ email: email.toLowerCase() });
    // Several fields on the schema are `select: false` — we re-include them
    // here so auth flows (password check, verification/reset token flows)
    // have access to their working values on the returned doc.
    q.select(
      '+emailVerificationTokenHash +passwordResetTokenHash' +
        (withPassword ? ' +password' : ''),
    );
    return q.exec();
  }

  /** Looks up the user who owns a given (hashed) email-verification token. */
  async findByVerificationTokenHash(tokenHash: string) {
    return this.model
      .findOne({ emailVerificationTokenHash: tokenHash })
      .select('+emailVerificationTokenHash')
      .exec();
  }

  /** Looks up the user who owns a given (hashed) password-reset token. */
  async findByPasswordResetTokenHash(tokenHash: string) {
    return this.model
      .findOne({ passwordResetTokenHash: tokenHash })
      .select('+passwordResetTokenHash +password')
      .exec();
  }

  /**
   * Creates or updates a user from a verified social-provider identity
   * (Google / Apple). Matches on provider-user-id first, then falls back
   * to email — so a user who signed up locally and later taps Google with
   * the same inbox gets their existing account linked instead of duped.
   */
  async upsertSocialUser(opts: {
    provider: 'google' | 'apple';
    providerUserId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    photo?: string;
  }) {
    const providerField =
      opts.provider === 'google' ? 'googleUserId' : 'appleUserId';
    let user = await this.model
      .findOne({ [providerField]: opts.providerUserId })
      .exec();
    if (!user && opts.email) {
      user = await this.model
        .findOne({ email: opts.email.toLowerCase() })
        .exec();
    }
    if (!user) {
      user = await this.model.create({
        firstName: opts.firstName || 'Consora',
        lastName: opts.lastName || 'User',
        email: opts.email.toLowerCase(),
        password: '',
        photo: opts.photo || '',
        authProvider: opts.provider,
        emailVerified: true,
        [providerField]: opts.providerUserId,
      });
      return user;
    }
    // Link provider id to the existing account (and promote to social if
    // still marked "local"). We never overwrite firstName/lastName that
    // the user may have customised.
    let dirty = false;
    if (!(user as any)[providerField]) {
      (user as any)[providerField] = opts.providerUserId;
      dirty = true;
    }
    if (user.authProvider === 'local') {
      user.authProvider = opts.provider;
      dirty = true;
    }
    if (!user.emailVerified) {
      user.emailVerified = true;
      dirty = true;
    }
    if (!user.photo && opts.photo) {
      user.photo = opts.photo;
      dirty = true;
    }
    if (dirty) await user.save();
    return user;
  }

  async findById(id: string) {
    return this.model.findById(id).exec();
  }

  async findByIdWithPassword(id: string) {
    return this.model.findById(id).select('+password').exec();
  }

  async list(opts: { q?: string; role?: string; banned?: string } = {}) {
    const filter: any = {};
    if (opts.q) {
      const rx = new RegExp(opts.q, 'i');
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
    }
    if (opts.role) filter.role = opts.role;
    if (opts.banned === 'true') filter.isBanned = true;
    if (opts.banned === 'false') filter.isBanned = false;
    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .exec();
    return docs.map((d) => this.toPublic(d));
  }

  async count(filter: any = {}) {
    return this.model.countDocuments(filter).exec();
  }

  async create(data: Partial<User>) {
    return this.model.create(data);
  }

  async update(id: string, data: Partial<User>) {
    const u = await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async setOnline(id: string, online: boolean) {
    await this.model.findByIdAndUpdate(id, { isOnline: online }).exec();
  }

  async ban(id: string, banned = true) {
    return this.update(id, { isBanned: banned });
  }

  /**
   * Admin-triggered email verification toggle.
   * Marking a user as verified also clears any outstanding verification
   * token so the old email link can't be replayed; marking them as
   * unverified leaves tokens alone — the next login will auto-reissue.
   */
  async setEmailVerified(id: string, verified: boolean) {
    const u = await this.model.findById(id).exec();
    if (!u) throw new NotFoundException('User not found');
    u.emailVerified = verified;
    if (verified) {
      u.emailVerificationTokenHash = null;
      u.emailVerificationExpiresAt = null;
    }
    await u.save();
    return u;
  }

  // ── Profile editing ─────────────────────────────────────────────────────

  /** Updates only the fields a user is allowed to set on themselves. */
  async updateProfile(
    id: string,
    body: {
      firstName?: string;
      lastName?: string;
      photo?: string;
      bio?: string;
      settings?: any;
    },
  ) {
    const allowed: any = {};
    if (typeof body.firstName === 'string') allowed.firstName = body.firstName.trim();
    if (typeof body.lastName === 'string') allowed.lastName = body.lastName.trim();
    if (typeof body.photo === 'string') allowed.photo = body.photo;
    if (typeof body.bio === 'string') allowed.bio = body.bio.slice(0, 280);
    if (body.settings) allowed.settings = body.settings;
    return this.update(id, allowed);
  }

  async changePassword(id: string, current: string, next: string) {
    if (!next || next.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters');
    }
    const u = await this.findByIdWithPassword(id);
    if (!u) throw new NotFoundException('User not found');
    const ok = await bcrypt.compare(current, u.password);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    u.password = await bcrypt.hash(next, 10);
    await u.save();
    return { ok: true };
  }

  async setVisibility(id: string, visibility: 'public' | 'private') {
    if (visibility !== 'public' && visibility !== 'private') {
      throw new BadRequestException('Invalid visibility');
    }
    return this.update(id, { visibility });
  }

  // ── Block / unblock ─────────────────────────────────────────────────────

  async block(blockerId: string, targetId: string) {
    if (blockerId === targetId) {
      throw new BadRequestException('Cannot block yourself');
    }
    const target = await this.model.findById(targetId).exec();
    if (!target) throw new NotFoundException('User not found');
    await this.model
      .findByIdAndUpdate(blockerId, {
        $addToSet: { blockedUsers: new Types.ObjectId(targetId) },
      })
      .exec();
    return { ok: true };
  }

  async unblock(blockerId: string, targetId: string) {
    await this.model
      .findByIdAndUpdate(blockerId, {
        $pull: { blockedUsers: new Types.ObjectId(targetId) },
      })
      .exec();
    return { ok: true };
  }

  async getBlockedUsers(id: string) {
    const u = await this.model
      .findById(id)
      .populate('blockedUsers', 'firstName lastName email photo role visibility')
      .exec();
    if (!u) throw new NotFoundException('User not found');
    return (u.blockedUsers as any[]).map((b) => ({
      id: b._id?.toString?.() ?? b._id,
      firstName: b.firstName,
      lastName: b.lastName,
      email: b.email,
      photo: b.photo,
      role: b.role,
    }));
  }

  // ── Stars ───────────────────────────────────────────────────────────────

  async star(starrerId: string, targetId: string) {
    if (starrerId === targetId) {
      throw new BadRequestException('Cannot star yourself');
    }
    const target = await this.model.findById(targetId).exec();
    if (!target) throw new NotFoundException('User not found');
    const starrer = await this.model.findById(starrerId).exec();
    if (!starrer) throw new NotFoundException('User not found');
    const targetObjectId = new Types.ObjectId(targetId);
    const already = starrer.starredUsers.some(
      (uid) => uid.toString() === targetId,
    );
    if (already) return { ok: true, alreadyStarred: true };
    await this.model
      .findByIdAndUpdate(starrerId, {
        $addToSet: { starredUsers: targetObjectId },
      })
      .exec();
    await this.model
      .findByIdAndUpdate(targetId, { $inc: { starsReceived: 1 } })
      .exec();
    return { ok: true };
  }

  async unstar(starrerId: string, targetId: string) {
    const starrer = await this.model.findById(starrerId).exec();
    if (!starrer) throw new NotFoundException('User not found');
    const targetObjectId = new Types.ObjectId(targetId);
    const has = starrer.starredUsers.some(
      (uid) => uid.toString() === targetId,
    );
    if (!has) return { ok: true, notStarred: true };
    await this.model
      .findByIdAndUpdate(starrerId, {
        $pull: { starredUsers: targetObjectId },
      })
      .exec();
    await this.model
      .findByIdAndUpdate(targetId, { $inc: { starsReceived: -1 } })
      .exec();
    return { ok: true };
  }

  // ── Search & public profile ─────────────────────────────────────────────

  /**
   * Search by name or email. Excludes the caller, banned users, and anyone
   * who has blocked the caller. Private profiles are still listed but show
   * only minimal info via getPublicProfile().
   */
  async search(q: string, viewerId: string) {
    if (!q || !q.trim()) return [];
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const docs = await this.model
      .find({
        _id: { $ne: new Types.ObjectId(viewerId) },
        isBanned: false,
        blockedUsers: { $ne: new Types.ObjectId(viewerId) },
        $or: [{ firstName: rx }, { lastName: rx }, { email: rx }],
      })
      .limit(30)
      .exec();
    return docs.map((d) => ({
      id: (d as any)._id.toString(),
      firstName: d.firstName,
      lastName: d.lastName,
      photo: d.photo,
      role: d.role,
      visibility: d.visibility,
      starsReceived: d.starsReceived,
      trustScore: d.trustScore,
    }));
  }

  /**
   * Public-facing profile. Honors visibility setting and reveals
   * viewer-relative flags (isBlocked, isStarred). If the target has
   * blocked the viewer, returns 404 to avoid leaking existence.
   */
  async getPublicProfile(targetId: string, viewerId: string) {
    const u = await this.model.findById(targetId).exec();
    if (!u || u.isBanned) throw new NotFoundException('User not found');
    if (u.blockedUsers.some((uid) => uid.toString() === viewerId)) {
      throw new NotFoundException('User not found');
    }
    const viewer = await this.model.findById(viewerId).exec();
    const isStarred = !!viewer?.starredUsers.some(
      (uid) => uid.toString() === targetId,
    );
    const isBlocked = !!viewer?.blockedUsers.some(
      (uid) => uid.toString() === targetId,
    );
    const isSelf = targetId === viewerId;
    const base = {
      id: (u as any)._id.toString(),
      firstName: u.firstName,
      lastName: u.lastName,
      photo: u.photo,
      role: u.role,
      visibility: u.visibility,
      starsReceived: u.starsReceived,
      isStarred,
      isBlocked,
      isSelf,
      memberSince: (u as any).createdAt,
    };
    // Private profile: hide stats and bio unless self.
    if (u.visibility === 'private' && !isSelf) {
      return base;
    }
    return {
      ...base,
      bio: u.bio,
      trustScore: u.trustScore,
      completedChallenges: u.completedChallenges,
      failedChallenges: u.failedChallenges,
      isOnline: u.isOnline,
    };
  }

  /** Returns the full user record as a JSON-serialisable object for export. */
  async exportData(id: string) {
    const u = await this.model
      .findById(id)
      .populate('blockedUsers', 'firstName lastName email')
      .populate('starredUsers', 'firstName lastName email')
      .exec();
    if (!u) throw new NotFoundException('User not found');
    const o: any = u.toObject();
    delete o.password;
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: o._id?.toString?.() ?? o._id,
        firstName: o.firstName,
        lastName: o.lastName,
        email: o.email,
        photo: o.photo,
        bio: o.bio,
        role: o.role,
        visibility: o.visibility,
        memberSince: o.createdAt,
      },
      stats: {
        trustScore: o.trustScore,
        completedChallenges: o.completedChallenges,
        failedChallenges: o.failedChallenges,
        likesGiven: o.likesGiven,
        messagesSent: o.messagesSent,
        starsReceived: o.starsReceived,
      },
      blockedUsers: o.blockedUsers,
      starredUsers: o.starredUsers,
      settings: o.settings,
    };
  }

  /**
   * Recompute and persist the user trust score.
   * Formula (0..100), activity-driven (a brand-new user starts at 0):
   *   + 5 per completed challenge   (cap +60)
   *   - 5 per failed challenge      (cap -30)
   *   + min(40, likes/3 + messages/10)  (social activity)
   */
  async recomputeTrust(id: string) {
    const u = await this.model.findById(id).exec();
    if (!u) return;
    // Admins are seeded at 100 and creators are pinned at 100 (either
    // earned or promoted by admin). Neither should be recomputed.
    if (u.role === 'admin' || u.role === 'creator') return u;
    const completedBonus = Math.min(60, u.completedChallenges * 5);
    const failPenalty = Math.min(30, u.failedChallenges * 5);
    const social = Math.min(40, u.likesGiven / 3 + u.messagesSent / 10);
    const score = Math.max(
      0,
      Math.min(100, Math.round(completedBonus - failPenalty + social)),
    );
    u.trustScore = score;

    // Auto-promote to creator once threshold met (idempotent). Default is
    // 100 — a user must build a perfect track record to earn it.
    const threshold = parseInt(
      process.env.CREATOR_TRUST_THRESHOLD || '100',
      10,
    );
    if (u.role === 'user' && score >= threshold) {
      u.role = 'creator';
    }
    await u.save();
    return u;
  }

  /**
   * Admin: set the user's trust score directly (0..100). The role follows
   * the score automatically:
   *   - score >= threshold (100)  → promote 'user' to 'creator'
   *   - score <  threshold        → demote 'creator' back to 'user'
   * Admins are immune (pinned at 100 by the seeder).
   */
  async setTrustScore(id: string, value: number) {
    const u = await this.model.findById(id).exec();
    if (!u) throw new NotFoundException('User not found');
    if (u.role === 'admin') return u; // admins stay at their seeded value
    const score = Math.max(0, Math.min(100, Math.round(value)));
    u.trustScore = score;
    const threshold = parseInt(
      process.env.CREATOR_TRUST_THRESHOLD || '100',
      10,
    );
    if (u.role === 'user' && score >= threshold) {
      u.role = 'creator';
    } else if (u.role === 'creator' && score < threshold) {
      u.role = 'user';
    }
    await u.save();
    return u;
  }

  /**
   * Admin: change a user's role. Promoting to 'creator' pins trust to 100.
   * Demoting back to 'user' resets the score so the formula can rebuild it.
   */
  async setRole(id: string, role: 'user' | 'creator' | 'admin') {
    const u = await this.model.findById(id).exec();
    if (!u) throw new NotFoundException('User not found');
    u.role = role;
    if (role === 'creator' || role === 'admin') {
      u.trustScore = 100;
    } else if (role === 'user') {
      // Let the formula decide on the next recompute — reset to the
      // activity-driven baseline rather than leave a stale 100 behind.
      u.trustScore = 0;
    }
    await u.save();
    if (role === 'user') {
      return this.recomputeTrust(id).then((x) => x ?? u);
    }
    return u;
  }

  async incrementCounter(
    id: string,
    field:
      | 'completedChallenges'
      | 'failedChallenges'
      | 'likesGiven'
      | 'messagesSent',
    by = 1,
  ) {
    await this.model
      .findByIdAndUpdate(id, { $inc: { [field]: by } })
      .exec();
    await this.recomputeTrust(id);
  }

  toPublic(u: UserDocument | (User & { _id: Types.ObjectId })) {
    const o: any = (u as any).toObject ? (u as any).toObject() : u;
    delete o.password;
    return {
      id: o._id?.toString?.() ?? o._id,
      firstName: o.firstName,
      lastName: o.lastName,
      email: o.email,
      photo: o.photo,
      bio: o.bio ?? '',
      visibility: o.visibility ?? 'public',
      role: o.role,
      isOnline: o.isOnline,
      isBanned: o.isBanned,
      emailVerified: !!o.emailVerified,
      authProvider: o.authProvider ?? 'local',
      trustScore: o.trustScore,
      completedChallenges: o.completedChallenges,
      failedChallenges: o.failedChallenges,
      starsReceived: o.starsReceived ?? 0,
      starredUsers: (o.starredUsers ?? []).map((id: any) => id.toString()),
      blockedUsers: (o.blockedUsers ?? []).map((id: any) => id.toString()),
      settings: o.settings,
      createdAt: o.createdAt,
    };
  }
}
