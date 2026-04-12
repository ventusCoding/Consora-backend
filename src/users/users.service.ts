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
    if (withPassword) q.select('+password');
    return q.exec();
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
   * Formula (0..100):
   *   base 50
   *   + 5 per completed challenge  (cap +30)
   *   - 8 per failed challenge     (cap -40)
   *   + min(20, likes/5 + messages/20)  (social activity)
   */
  async recomputeTrust(id: string) {
    const u = await this.model.findById(id).exec();
    if (!u) return;
    const completedBonus = Math.min(30, u.completedChallenges * 5);
    const failPenalty = Math.min(40, u.failedChallenges * 8);
    const social = Math.min(20, u.likesGiven / 5 + u.messagesSent / 20);
    const score = Math.max(
      0,
      Math.min(100, Math.round(50 + completedBonus - failPenalty + social)),
    );
    u.trustScore = score;

    // Auto-promote to creator once threshold met (idempotent).
    const threshold = parseInt(
      process.env.CREATOR_TRUST_THRESHOLD || '75',
      10,
    );
    if (u.role === 'user' && score >= threshold) {
      u.role = 'creator';
    }
    await u.save();
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
