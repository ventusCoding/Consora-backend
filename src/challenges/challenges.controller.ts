import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtUser,
} from '../common/decorators/current-user.decorator';
import { ChallengesService } from './challenges.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';

@Controller('challenges')
export class ChallengesController {
  constructor(private svc: ChallengesService) {}

  @Get()
  list(@Query() q: any) {
    // Public listing hides ended challenges by default; clients can opt into
    // 'active', 'ended', or 'all' when they need a different slice.
    const status = q.status ?? 'upcoming';
    return this.svc.list({ ...q, status });
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  mine(@CurrentUser() u: JwtUser) {
    return this.svc.myChallenges(u.sub);
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.svc.byId(id);
  }

  @Get(':id/participants')
  participants(@Param('id') id: string) {
    return this.svc.participants(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'creator')
  @Post()
  create(@Body() dto: CreateChallengeDto, @CurrentUser() u: JwtUser) {
    return this.svc.create(dto, u.sub, u.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'creator')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateChallengeDto>,
    @CurrentUser() u: JwtUser,
  ) {
    return this.svc.update(id, dto, u.sub, u.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'creator')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: JwtUser) {
    return this.svc.remove(id, u.sub, u.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  join(@Param('id') id: string, @CurrentUser() u: JwtUser) {
    return this.svc.join(id, u.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/leave')
  leave(@Param('id') id: string, @CurrentUser() u: JwtUser) {
    return this.svc.leave(id, u.sub);
  }
}
