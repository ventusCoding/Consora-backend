import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  JwtUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CheckinsService } from './checkins.service';

@Controller('checkins')
@UseGuards(JwtAuthGuard)
export class CheckinsController {
  constructor(private svc: CheckinsService) {}

  @Post(':challengeId')
  submit(
    @Param('challengeId') challengeId: string,
    @Body() body: { videoUrl: string; caption?: string; dayNumber: number },
    @CurrentUser() u: JwtUser,
  ) {
    return this.svc.submit(challengeId, u.sub, body);
  }

  @Get()
  list(
    @Query('challengeId') challengeId: string,
    @Query('userId') userId: string,
  ) {
    if (challengeId) return this.svc.listForChallenge(challengeId);
    if (userId) return this.svc.listForUser(userId);
    return [];
  }

  @Post(':id/like')
  like(@Param('id') id: string, @CurrentUser() u: JwtUser) {
    return this.svc.like(id, u.sub);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() u: JwtUser) {
    return this.svc.adminReject(id, u.sub);
  }
}
