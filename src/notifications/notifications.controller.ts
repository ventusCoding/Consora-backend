import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  JwtUser,
} from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) {
    return this.svc.listForUser(u.sub);
  }

  @Post(':id/read')
  read(@Param('id') id: string, @CurrentUser() u: JwtUser) {
    return this.svc.markRead(id, u.sub);
  }

  @Post('read-all')
  readAll(@CurrentUser() u: JwtUser) {
    return this.svc.markAllRead(u.sub);
  }
}
