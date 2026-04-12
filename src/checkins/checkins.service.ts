import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Checkin, CheckinDocument } from './schemas/checkin.schema';
import { ChallengesService } from '../challenges/challenges.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class CheckinsService {
  constructor(
    @InjectModel(Checkin.name) private model: Model<CheckinDocument>,
    private challenges: ChallengesService,
    private users: UsersService,
  ) {}

  async submit(
    challengeId: string,
    userId: string,
    dto: { videoUrl: string; caption?: string; dayNumber: number },
  ) {
    const part = await this.challenges.participantFor(challengeId, userId);
    if (!part) throw new BadRequestException('Not a participant');
    if (part.status === 'failed')
      throw new BadRequestException('Challenge already failed');

    // TODO(ai-verification): replace auto-approval with a call to the AI
    // verification pipeline (frame sampling → model inference → approve/reject).
    // For now, the system auto-approves submitted proofs.
    const status = 'approved' as const;

    const doc = await this.model.create({
      challenge: new Types.ObjectId(challengeId),
      user: new Types.ObjectId(userId),
      dayNumber: dto.dayNumber,
      videoUrl: dto.videoUrl,
      caption: dto.caption || '',
      status,
      reviewedBy: 'system',
    });

    if (status === 'approved') {
      await this.challenges.markDayCompleted(challengeId, userId);
    }
    return doc;
  }

  async listForChallenge(challengeId: string) {
    return this.model
      .find({ challenge: challengeId })
      .populate('user', 'firstName lastName photo trustScore')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async listForUser(userId: string) {
    return this.model
      .find({ user: userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async like(id: string, userId: string) {
    const c = await this.model.findById(id);
    if (!c) throw new NotFoundException();
    const uid = new Types.ObjectId(userId);
    const has = c.likes.some((l) => l.toString() === userId);
    if (has) {
      c.likes = c.likes.filter((l) => l.toString() !== userId);
    } else {
      c.likes.push(uid);
      await this.users.incrementCounter(userId, 'likesGiven');
    }
    c.likesCount = c.likes.length;
    await c.save();
    return { liked: !has, likesCount: c.likesCount };
  }

  /** Admin action: reject a proof → day counts as failed for that user. */
  async adminReject(id: string, adminId: string) {
    const c = await this.model.findById(id);
    if (!c) throw new NotFoundException();
    c.status = 'rejected';
    c.reviewedBy = adminId;
    await c.save();
    await this.challenges.markDayFailed(
      c.challenge.toString(),
      c.user.toString(),
    );
    return c;
  }

  /** Admin action: approve a pending proof → day counts as completed. */
  async adminApprove(id: string, adminId: string) {
    const c = await this.model.findById(id);
    if (!c) throw new NotFoundException();
    c.status = 'approved';
    c.reviewedBy = adminId;
    await c.save();
    await this.challenges.markDayCompleted(
      c.challenge.toString(),
      c.user.toString(),
    );
    return c;
  }

  /** Admin list with optional status filter. Populates challenge + user. */
  async adminList(status?: 'pending' | 'approved' | 'rejected') {
    const filter: any = {};
    if (status) filter.status = status;
    return this.model
      .find(filter)
      .populate('user', 'firstName lastName photo email')
      .populate('challenge', 'name image')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec();
  }

  count(filter: any = {}) {
    return this.model.countDocuments(filter).exec();
  }
}
