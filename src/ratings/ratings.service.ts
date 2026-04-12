import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Rating, RatingDocument } from './schemas/rating.schema';
import { ChallengesService } from '../challenges/challenges.service';

@Injectable()
export class RatingsService {
  constructor(
    @InjectModel(Rating.name) private model: Model<RatingDocument>,
    private challenges: ChallengesService,
  ) {}

  async rate(
    challengeId: string,
    userId: string,
    dto: { score: number; comment?: string },
  ) {
    if (dto.score < 1 || dto.score > 5)
      throw new BadRequestException('Score must be 1..5');

    // Only participants who completed the challenge can rate.
    const part = await this.challenges.participantFor(challengeId, userId);
    if (!part) throw new ForbiddenException('Not a participant');
    if (part.status !== 'completed')
      throw new ForbiddenException('Challenge not completed');

    return this.model.findOneAndUpdate(
      { challenge: new Types.ObjectId(challengeId), user: new Types.ObjectId(userId) },
      { score: dto.score, comment: dto.comment || '' },
      { upsert: true, new: true },
    );
  }

  async listForChallenge(challengeId: string) {
    const items = await this.model
      .find({ challenge: challengeId })
      .populate('user', 'firstName lastName photo')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const avg =
      items.length > 0
        ? items.reduce((s, r: any) => s + r.score, 0) / items.length
        : 0;
    return { average: Math.round(avg * 10) / 10, count: items.length, items };
  }
}
