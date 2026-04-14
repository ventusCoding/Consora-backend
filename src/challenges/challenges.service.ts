import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Challenge, ChallengeDocument } from './schemas/challenge.schema';
import {
  Participant,
  ParticipantDocument,
} from './schemas/participant.schema';
import { UsersService } from '../users/users.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';

@Injectable()
export class ChallengesService {
  constructor(
    @InjectModel(Challenge.name)
    private challengeModel: Model<ChallengeDocument>,
    @InjectModel(Participant.name)
    private participantModel: Model<ParticipantDocument>,
    private users: UsersService,
  ) {}

  // ── CRUD ─────────────────────────────────────────────────────────────

  async create(
    dto: CreateChallengeDto,
    creatorId: string,
    creatorRole: 'user' | 'creator' | 'admin',
  ) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start)
      throw new BadRequestException('endDate must be after startDate');
    // Allow a small clock-skew tolerance so a submission that arrives a few
    // seconds after "now" is not rejected.
    if (start.getTime() < Date.now() - 60_000)
      throw new BadRequestException('startDate cannot be in the past');

    // Non-admin creators must meet the trust threshold.
    if (creatorRole !== 'admin') {
      const u = await this.users.findById(creatorId);
      const threshold = parseInt(
        process.env.CREATOR_TRUST_THRESHOLD || '75',
        10,
      );
      if (!u || u.trustScore < threshold) {
        throw new ForbiddenException(
          `Trust score ${threshold}+ required to create challenges`,
        );
      }
    }

    // Only admins create admin challenges; paid challenges are creator-only.
    const creatorType = creatorRole === 'admin' ? 'admin' : 'creator';
    const isPaid = creatorType === 'creator' ? !!dto.isPaid : false;

    return this.challengeModel.create({
      ...dto,
      startDate: start,
      endDate: end,
      isPaid,
      price: isPaid ? dto.price || 0 : 0,
      creator: new Types.ObjectId(creatorId),
      creatorType,
    });
  }

  async update(id: string, dto: Partial<CreateChallengeDto>, userId: string, role: string) {
    const c = await this.challengeModel.findById(id).exec();
    if (!c) throw new NotFoundException();
    if (role !== 'admin' && c.creator.toString() !== userId)
      throw new ForbiddenException();
    Object.assign(c, dto);
    if (dto.startDate) c.startDate = new Date(dto.startDate);
    if (dto.endDate) c.endDate = new Date(dto.endDate);
    await c.save();
    return c;
  }

  async remove(id: string, userId: string, role: string) {
    const c = await this.challengeModel.findById(id).exec();
    if (!c) throw new NotFoundException();
    if (role !== 'admin' && c.creator.toString() !== userId)
      throw new ForbiddenException();
    await this.participantModel.deleteMany({ challenge: c._id }).exec();
    await c.deleteOne();
    return { ok: true };
  }

  async list(query: {
    category?: string;
    difficulty?: string;
    isPaid?: string;
    search?: string;
    status?: 'upcoming' | 'active' | 'ended' | 'all';
  }) {
    const filter: any = {};
    if (query.category) filter.category = query.category;
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.isPaid === 'true') filter.isPaid = true;
    if (query.isPaid === 'false') filter.isPaid = false;
    if (query.search)
      filter.$or = [
        { name: new RegExp(query.search, 'i') },
        { description: new RegExp(query.search, 'i') },
      ];

    const now = new Date();
    if (query.status === 'upcoming') {
      filter.startDate = { $gt: now };
    } else if (query.status === 'active') {
      filter.startDate = { $lte: now };
      filter.endDate = { $gte: now };
    } else if (query.status === 'ended') {
      filter.endDate = { $lt: now };
    }

    const list = await this.challengeModel
      .find(filter)
      .populate('creator', 'firstName lastName photo role trustScore')
      .sort({ startDate: 1, createdAt: -1 })
      .lean()
      .exec();
    return Promise.all(list.map((c) => this.decorate(c)));
  }

  async byId(id: string) {
    const c = await this.challengeModel
      .findById(id)
      .populate('creator', 'firstName lastName photo role trustScore')
      .lean()
      .exec();
    if (!c) throw new NotFoundException();
    return this.decorate(c);
  }

  async participants(challengeId: string) {
    const list = await this.participantModel
      .find({ challenge: challengeId })
      .populate('user', 'firstName lastName photo trustScore isOnline')
      .lean()
      .exec();
    return list;
  }

  // ── Join / leave ─────────────────────────────────────────────────────

  async join(challengeId: string, userId: string) {
    const c = await this.challengeModel.findById(challengeId).exec();
    if (!c) throw new NotFoundException();

    // TODO(payment): for paid challenges, require a successful Google/Apple Pay
    // charge before continuing. For now we bypass and mark hasPaid=true.
    const hasPaid = c.isPaid ? true : false;

    const existing = await this.participantModel.findOne({
      challenge: c._id,
      user: new Types.ObjectId(userId),
    });
    if (existing) return existing;

    const started = new Date() >= c.startDate;
    return this.participantModel.create({
      challenge: c._id,
      user: new Types.ObjectId(userId),
      status: started ? 'inProgress' : 'notStarted',
      joinedAt: new Date(),
      hasPaid,
    });
  }

  async leave(challengeId: string, userId: string) {
    await this.participantModel.deleteOne({
      challenge: new Types.ObjectId(challengeId),
      user: new Types.ObjectId(userId),
    });
    return { ok: true };
  }

  async participantFor(challengeId: string, userId: string) {
    return this.participantModel.findOne({
      challenge: new Types.ObjectId(challengeId),
      user: new Types.ObjectId(userId),
    });
  }

  async myChallenges(userId: string) {
    const parts = await this.participantModel
      .find({ user: new Types.ObjectId(userId) })
      .populate({
        path: 'challenge',
        populate: { path: 'creator', select: 'firstName lastName photo role' },
      })
      .exec();
    const out: any[] = [];
    for (const p of parts) {
      const c: any = p.challenge;
      if (!c) continue;
      const reconciled = await this.reconcileParticipant(p, c);
      out.push({
        ...(await this.decorate(c)),
        myStatus: reconciled.status,
        myDaysCompleted: reconciled.daysCompleted,
        myDaysMissed: reconciled.daysMissed,
      });
    }
    return out;
  }

  /// Lazily move participant status forward based on challenge dates.
  /// - notStarted → inProgress once startDate is reached.
  /// - inProgress → completed (if daysCompleted meets total) or failed
  ///   once endDate has passed.
  /// Already-terminal statuses are left alone.
  private async reconcileParticipant(
    p: ParticipantDocument,
    challenge: { startDate: Date; endDate: Date },
  ) {
    const now = new Date();
    let dirty = false;
    if (p.status === 'notStarted' && now >= challenge.startDate) {
      p.status = 'inProgress';
      dirty = true;
    }
    if (p.status === 'inProgress' && now > challenge.endDate) {
      const totalDays = this.dayCount(challenge.startDate, challenge.endDate);
      if (p.daysCompleted >= totalDays) {
        p.status = 'completed';
        await this.users.incrementCounter(
          p.user.toString(),
          'completedChallenges',
        );
      } else {
        p.status = 'failed';
        await this.users.incrementCounter(
          p.user.toString(),
          'failedChallenges',
        );
      }
      dirty = true;
    }
    if (dirty) await p.save();
    return p;
  }

  // ── Status transitions (called by checkin service) ──────────────────

  async markDayCompleted(challengeId: string, userId: string) {
    const p = await this.participantFor(challengeId, userId);
    if (!p) throw new NotFoundException('Not a participant');
    p.daysCompleted += 1;
    p.status = 'inProgress';

    const c = await this.challengeModel.findById(challengeId).exec();
    const totalDays = this.dayCount(c.startDate, c.endDate);
    if (p.daysCompleted >= totalDays) {
      p.status = 'completed';
      await this.users.incrementCounter(userId, 'completedChallenges');
    }
    await p.save();
    return p;
  }

  async markDayFailed(challengeId: string, userId: string) {
    const p = await this.participantFor(challengeId, userId);
    if (!p) throw new NotFoundException('Not a participant');
    p.status = 'failed';
    p.daysMissed += 1;
    await p.save();
    await this.users.incrementCounter(userId, 'failedChallenges');
    return p;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private dayCount(start: Date, end: Date) {
    return Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86400000),
    );
  }

  count(filter: any = {}) {
    return this.challengeModel.countDocuments(filter).exec();
  }

  countParticipants(filter: any = {}) {
    return this.participantModel.countDocuments(filter).exec();
  }

  async decorate(c: any) {
    const count = await this.participantModel.countDocuments({
      challenge: c._id,
    });
    const completed = await this.participantModel.countDocuments({
      challenge: c._id,
      status: 'completed',
    });
    const rate = count > 0 ? Math.round((completed / count) * 100) : 0;
    const now = new Date();
    const start = c.startDate instanceof Date ? c.startDate : new Date(c.startDate);
    const end = c.endDate instanceof Date ? c.endDate : new Date(c.endDate);
    let status: 'upcoming' | 'active' | 'ended';
    if (now < start) status = 'upcoming';
    else if (now > end) status = 'ended';
    else status = 'active';
    return {
      id: c._id.toString(),
      name: c.name,
      description: c.description,
      image: c.image,
      startDate: c.startDate,
      endDate: c.endDate,
      dailyRequirement: c.dailyRequirement,
      difficulty: c.difficulty,
      category: c.category,
      isPublic: c.isPublic,
      isPaid: c.isPaid,
      price: c.price,
      currency: c.currency,
      creator: c.creator,
      creatorType: c.creatorType,
      memberCount: count,
      completionRate: rate,
      status,
      createdAt: c.createdAt,
    };
  }
}
