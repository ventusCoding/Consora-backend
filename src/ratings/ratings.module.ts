import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rating, RatingSchema } from './schemas/rating.schema';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Rating.name, schema: RatingSchema }]),
    ChallengesModule,
  ],
  controllers: [RatingsController],
  providers: [RatingsService],
})
export class RatingsModule {}
