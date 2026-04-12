import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { ChallengesModule } from '../challenges/challenges.module';
import { CheckinsModule } from '../checkins/checkins.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [UsersModule, ChallengesModule, CheckinsModule, ReportsModule],
  controllers: [AdminController],
})
export class AdminModule {}
