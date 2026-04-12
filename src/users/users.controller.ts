import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  // ── Self ────────────────────────────────────────────────────────────────

  @Get('me')
  async me(@CurrentUser() user: JwtUser) {
    const u = await this.users.findById(user.sub);
    if (!u) throw new NotFoundException();
    return this.users.toPublic(u);
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: JwtUser, @Body() body: any) {
    const u = await this.users.updateProfile(user.sub, body);
    return this.users.toPublic(u);
  }

  @Patch('me/password')
  async changePassword(
    @CurrentUser() user: JwtUser,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.users.changePassword(
      user.sub,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Patch('me/visibility')
  async changeVisibility(
    @CurrentUser() user: JwtUser,
    @Body() body: { visibility: 'public' | 'private' },
  ) {
    const u = await this.users.setVisibility(user.sub, body.visibility);
    return this.users.toPublic(u);
  }

  @Get('me/blocked')
  async myBlocked(@CurrentUser() user: JwtUser) {
    return this.users.getBlockedUsers(user.sub);
  }

  @Get('me/export')
  async exportMe(@CurrentUser() user: JwtUser) {
    return this.users.exportData(user.sub);
  }

  // ── Search (must come before /:id) ──────────────────────────────────────

  @Get('search')
  async search(@CurrentUser() user: JwtUser, @Query('q') q?: string) {
    return this.users.search(q ?? '', user.sub);
  }

  // ── Public profile + interactions ───────────────────────────────────────

  @Get(':id')
  async byId(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.users.getPublicProfile(id, user.sub);
  }

  @Post(':id/block')
  async blockUser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.users.block(user.sub, id);
  }

  @Delete(':id/block')
  async unblockUser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.users.unblock(user.sub, id);
  }

  @Post(':id/star')
  async starUser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.users.star(user.sub, id);
  }

  @Delete(':id/star')
  async unstarUser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.users.unstar(user.sub, id);
  }
}
