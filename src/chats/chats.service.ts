import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { ChallengesService } from '../challenges/challenges.service';
import {
  Challenge,
  ChallengeDocument,
} from '../challenges/schemas/challenge.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class ChatsService {
  constructor(
    @InjectModel(Message.name) private msgModel: Model<MessageDocument>,
    @InjectModel(Challenge.name)
    private challengeModel: Model<ChallengeDocument>,
    private challenges: ChallengesService,
    private users: UsersService,
  ) {}

  async sendGroup(
    challengeId: string,
    senderId: string,
    text: string,
    imageUrl = '',
  ) {
    const part = await this.challenges.participantFor(challengeId, senderId);
    const c = await this.challengeModel.findById(challengeId);
    if (!c) throw new NotFoundException('Challenge not found');
    const isCreator = c.creator.toString() === senderId;
    if (!part && !isCreator)
      throw new ForbiddenException('Not a participant');

    const msg = await this.msgModel.create({
      challenge: new Types.ObjectId(challengeId),
      kind: 'group',
      sender: new Types.ObjectId(senderId),
      text,
      imageUrl,
    });
    await this.users.incrementCounter(senderId, 'messagesSent');
    return msg.populate('sender', 'firstName lastName photo');
  }

  async sendPrivate(
    challengeId: string,
    senderId: string,
    peerId: string,
    text: string,
    imageUrl = '',
  ) {
    const c = await this.challengeModel.findById(challengeId);
    if (!c) throw new NotFoundException();
    if (!c.isPaid)
      throw new BadRequestException('Private chat is paid-only');

    const isCreator = c.creator.toString() === senderId;
    const isCreatorPeer = c.creator.toString() === peerId;
    if (!isCreator && !isCreatorPeer)
      throw new ForbiddenException('Private chat must include the creator');

    // The "peer" field is always the participant side.
    const participantId = isCreator ? peerId : senderId;
    const part = await this.challenges.participantFor(
      challengeId,
      participantId,
    );
    if (!part || !part.hasPaid)
      throw new ForbiddenException('Participant has not paid');

    const msg = await this.msgModel.create({
      challenge: new Types.ObjectId(challengeId),
      kind: 'private',
      peer: new Types.ObjectId(participantId),
      sender: new Types.ObjectId(senderId),
      text,
      imageUrl,
    });
    await this.users.incrementCounter(senderId, 'messagesSent');
    return msg.populate('sender', 'firstName lastName photo');
  }

  async groupHistory(challengeId: string, limit = 100) {
    return this.msgModel
      .find({ challenge: challengeId, kind: 'group' })
      .populate('sender', 'firstName lastName photo')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async privateHistory(
    challengeId: string,
    participantId: string,
    limit = 100,
  ) {
    return this.msgModel
      .find({
        challenge: challengeId,
        kind: 'private',
        peer: new Types.ObjectId(participantId),
      })
      .populate('sender', 'firstName lastName photo')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }
}
