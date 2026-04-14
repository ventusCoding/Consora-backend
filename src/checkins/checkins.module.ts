import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Checkin, CheckinSchema } from './schemas/checkin.schema';
import { CheckinsService } from './checkins.service';
import { CheckinsController } from './checkins.controller';
import { ChallengesModule } from '../challenges/challenges.module';
import { UsersModule } from '../users/users.module';
import { LiveModule } from '../live/live.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Checkin.name, schema: CheckinSchema }]),
    ChallengesModule,
    UsersModule,
    LiveModule,
  ],
  controllers: [CheckinsController],
  providers: [CheckinsService],
  exports: [CheckinsService],
})
export class CheckinsModule {}
