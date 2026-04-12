import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChallengesModule } from './challenges/challenges.module';
import { CheckinsModule } from './checkins/checkins.module';
import { ChatsModule } from './chats/chats.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { RatingsModule } from './ratings/ratings.module';
import { AdminModule } from './admin/admin.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/consora',
    ),
    AuthModule,
    UsersModule,
    ChallengesModule,
    CheckinsModule,
    ChatsModule,
    NotificationsModule,
    ReportsModule,
    RatingsModule,
    AdminModule,
    UploadsModule,
  ],
})
export class AppModule {}
