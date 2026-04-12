import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    // registerAsync (not register) so the secret is read AFTER ConfigModule
    // has loaded .env. With plain register(), this file is evaluated at
    // import time — before ConfigModule.forRoot() runs — so process.env
    // is empty and JwtModule silently bakes in the 'dev-secret' fallback.
    // The strategy then verifies tokens with the real .env secret, which
    // mismatches and 401s every protected request.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') || '30d',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
