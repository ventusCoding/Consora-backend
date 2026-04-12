import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtUser,
} from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @Post()
  create(
    @Body()
    dto: {
      targetType: 'user' | 'checkin' | 'challenge';
      targetId: string;
      reason: string;
      details?: string;
    },
    @CurrentUser() u: JwtUser,
  ) {
    return this.svc.create(u.sub, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get()
  list() {
    return this.svc.list();
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { status: any }) {
    return this.svc.update(id, body.status);
  }
}
