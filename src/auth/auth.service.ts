import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private users: UsersService, private jwt: JwtService) {}

  async signup(dto: SignupDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');
    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email.toLowerCase(),
      password: hash,
    });
    return this.issue(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email, true);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.isBanned) throw new ForbiddenException('Account banned');
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issue(user);
  }

  private async issue(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    const token = await this.jwt.signAsync(payload, {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    });
    return { token, user: this.users.toPublic(user) };
  }
}
