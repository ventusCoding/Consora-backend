import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  JwtUser,
} from '../common/decorators/current-user.decorator';
import { RatingsService } from './ratings.service';

@Controller('ratings')
export class RatingsController {
  constructor(private svc: RatingsService) {}

  @Get(':challengeId')
  list(@Param('challengeId') id: string) {
    return this.svc.listForChallenge(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':challengeId')
  rate(
    @Param('challengeId') id: string,
    @Body() body: { score: number; comment?: string },
    @CurrentUser() u: JwtUser,
  ) {
    return this.svc.rate(id, u.sub, body);
  }
}
