import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Challenge, ChallengeSchema } from './schemas/challenge.schema';
import {
  Participant,
  ParticipantSchema,
} from './schemas/participant.schema';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Challenge.name, schema: ChallengeSchema },
      { name: Participant.name, schema: ParticipantSchema },
    ]),
    UsersModule,
  ],
  controllers: [ChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService, MongooseModule],
})
export class ChallengesModule {}
