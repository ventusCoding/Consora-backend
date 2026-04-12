import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { ChallengesService } from '../challenges/challenges.service';
import { CheckinsService } from '../checkins/checkins.service';
import { ReportsService } from '../reports/reports.service';
import { CreateChallengeDto } from '../challenges/dto/create-challenge.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private users: UsersService,
    private challenges: ChallengesService,
    private checkins: CheckinsService,
    private reports: ReportsService,
  ) {}

  // ── Dashboard ──────────────────────────────────────────────────────────

  @Get('stats')
  async stats() {
    const [
      totalUsers,
      bannedUsers,
      creators,
      totalChallenges,
      paidChallenges,
      totalCheckins,
      pendingCheckins,
      rejectedCheckins,
      openReports,
      activeParticipations,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({ isBanned: true }),
      this.users.count({ role: 'creator' }),
      this.challenges.count(),
      this.challenges.count({ isPaid: true }),
      this.checkins.count(),
      this.checkins.count({ status: 'pending' }),
      this.checkins.count({ status: 'rejected' }),
      this.reports.list().then((r) => r.filter((x: any) => x.status === 'open').length),
      this.challenges.countParticipants({ status: 'inProgress' }),
    ]);
    return {
      totalUsers,
      bannedUsers,
      creators,
      totalChallenges,
      paidChallenges,
      totalCheckins,
      pendingCheckins,
      rejectedCheckins,
      openReports,
      activeParticipations,
    };
  }

  // ── Users ──────────────────────────────────────────────────────────────

  @Get('users')
  listUsers(
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('banned') banned?: string,
  ) {
    return this.users.list({ q, role, banned });
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    const u = await this.users.findById(id);
    return u ? this.users.toPublic(u) : null;
  }

  @Post('users/:id/ban')
  async ban(@Param('id') id: string, @Body() body: { banned?: boolean }) {
    const u = await this.users.ban(id, body?.banned ?? true);
    return this.users.toPublic(u);
  }

  @Patch('users/:id/role')
  async setRole(@Param('id') id: string, @Body() body: { role: string }) {
    const u = await this.users.update(id, { role: body.role } as any);
    return this.users.toPublic(u);
  }

  // ── Challenges ─────────────────────────────────────────────────────────

  @Get('challenges')
  listChallenges(
    @Query('category') category?: string,
    @Query('difficulty') difficulty?: string,
    @Query('isPaid') isPaid?: string,
    @Query('search') search?: string,
  ) {
    return this.challenges.list({ category, difficulty, isPaid, search });
  }

  @Get('challenges/:id')
  getChallenge(@Param('id') id: string) {
    return this.challenges.byId(id);
  }

  @Post('challenges')
  createChallenge(@Body() dto: CreateChallengeDto, @Req() req: any) {
    return this.challenges.create(dto, req.user.sub, 'admin');
  }

  @Patch('challenges/:id')
  updateChallenge(
    @Param('id') id: string,
    @Body() dto: Partial<CreateChallengeDto>,
    @Req() req: any,
  ) {
    return this.challenges.update(id, dto, req.user.sub, 'admin');
  }

  @Delete('challenges/:id')
  deleteChallenge(@Param('id') id: string, @Req() req: any) {
    return this.challenges.remove(id, req.user.sub, 'admin');
  }

  @Post('challenges/:challengeId/fail/:userId')
  failUser(
    @Param('challengeId') challengeId: string,
    @Param('userId') userId: string,
  ) {
    return this.challenges.markDayFailed(challengeId, userId);
  }

  // ── Check-ins ──────────────────────────────────────────────────────────

  @Get('checkins')
  listCheckins(@Query('status') status?: 'pending' | 'approved' | 'rejected') {
    return this.checkins.adminList(status);
  }

  @Post('checkins/:id/approve')
  approveCheckin(@Param('id') id: string, @Req() req: any) {
    return this.checkins.adminApprove(id, req.user.sub);
  }

  @Post('checkins/:id/reject')
  reject(@Param('id') id: string, @Req() req: any) {
    return this.checkins.adminReject(id, req.user.sub);
  }

  // ── Reports ────────────────────────────────────────────────────────────

  @Get('reports')
  listReports() {
    return this.reports.list();
  }

  @Patch('reports/:id')
  updateReport(
    @Param('id') id: string,
    @Body() body: { status: 'open' | 'reviewed' | 'actioned' | 'dismissed' },
  ) {
    return this.reports.update(id, body.status);
  }
}
