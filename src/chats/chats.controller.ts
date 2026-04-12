import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChatsService } from './chats.service';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private svc: ChatsService) {}

  @Get(':challengeId/group')
  group(@Param('challengeId') id: string, @Query('limit') limit?: string) {
    return this.svc.groupHistory(id, limit ? parseInt(limit, 10) : 100);
  }

  @Get(':challengeId/private/:participantId')
  priv(
    @Param('challengeId') id: string,
    @Param('participantId') pid: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.privateHistory(id, pid, limit ? parseInt(limit, 10) : 100);
  }
}
