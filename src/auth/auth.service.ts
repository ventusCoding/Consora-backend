import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { MailerService } from '../mailer/mailer.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

/** Minutes the email-verification token stays valid. */
const VERIFY_TTL_MINUTES = 10;
/** Minutes the password-reset token stays valid. */
const RESET_TTL_MINUTES = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private mailer: MailerService,
    private config: ConfigService,
  ) {}

  // ── Signup & login ─────────────────────────────────────────────────────

  /**
   * Creates a local account and emails a verification link. The client is
   * expected to bounce the user back to login — we intentionally do NOT
   * issue a JWT here, because allowing unverified accounts straight into
   * the app defeats the purpose of verification.
   */
  async signup(dto: SignupDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');
    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email.toLowerCase(),
      password: hash,
      authProvider: 'local',
      emailVerified: false,
    });
    await this.issueAndSendVerification(user);
    return {
      emailSent: true,
      email: user.email,
      verificationRequired: true,
      expiresInMinutes: VERIFY_TTL_MINUTES,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email, true);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.isBanned) throw new ForbiddenException('Account banned');
    // Treat legacy docs with no authProvider field as 'local' (they were
    // all email/password before the social-login migration).
    const provider = user.authProvider || 'local';
    if (provider !== 'local') {
      throw new UnauthorizedException(
        `This account signs in with ${provider}. Use the ${provider} button.`,
      );
    }
    if (!user.password) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerified) {
      // Re-mail the verification link only if the current one has expired
      // (or was never sent) — this is the "relogin also resends" rule, but
      // it's rate-limited against the existing unexpired token to prevent
      // spam from repeated login attempts.
      await this.issueAndSendVerification(user, { respectRateLimit: true });
      throw new ForbiddenException({
        code: 'email_not_verified',
        message: 'Please verify your email before logging in.',
        email: user.email,
      });
    }
    return this.issue(user);
  }

  // ── Email verification ─────────────────────────────────────────────────

  /**
   * Explicit "resend" from the UI popup. Same rate-limit rule as login:
   * if the existing token is still valid we silently succeed without
   * mailing anything, so tapping Resend repeatedly can't be abused.
   */
  async resendVerification(email: string) {
    const user = await this.users.findByEmail(email);
    // Don't reveal whether the email is registered — always respond OK.
    const provider = user?.authProvider || 'local';
    if (!user || user.emailVerified || provider !== 'local') {
      return { ok: true };
    }
    await this.issueAndSendVerification(user, { respectRateLimit: true });
    return { ok: true, expiresInMinutes: VERIFY_TTL_MINUTES };
  }

  /** Called by GET /auth/verify-email?token=XXX. */
  async verifyEmail(rawToken: string) {
    if (!rawToken) throw new BadRequestException('Missing token');
    const tokenHash = this.hashToken(rawToken);
    // We stored the hash with select:false, so we need to bypass the default
    // projection.
    const user = await this.users.findByVerificationTokenHash(tokenHash);
    if (!user) throw new BadRequestException('Invalid or expired token');
    if (
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Verification link expired');
    }
    user.emailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;
    await user.save();
    return { ok: true };
  }

  // ── Forgot / reset password ────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.users.findByEmail(email);
    // Always OK — don't leak account existence.
    const provider = user?.authProvider || 'local';
    if (!user || provider !== 'local') return { ok: true };

    // Rate limit: if the existing reset token is still valid, don't send
    // another email. Same anti-spam reasoning as verification.
    if (
      user.passwordResetExpiresAt &&
      user.passwordResetExpiresAt.getTime() > Date.now()
    ) {
      return { ok: true, expiresInMinutes: RESET_TTL_MINUTES };
    }

    const rawToken = this.randomToken();
    user.passwordResetTokenHash = this.hashToken(rawToken);
    user.passwordResetExpiresAt = new Date(
      Date.now() + RESET_TTL_MINUTES * 60 * 1000,
    );
    user.passwordResetLastSentAt = new Date();
    await user.save();

    const baseUrl = this.publicBaseUrl();
    // Emails link to a backend bridge route which in turn redirects to the
    // Flutter deep link — that way clicking from a desktop mail client
    // lands on a page that tells the user to open on their phone.
    const resetUrl = `${baseUrl}/api/auth/reset-password-link?token=${rawToken}`;
    await this.mailer.sendPasswordResetEmail({
      to: user.email,
      firstName: user.firstName || 'there',
      resetUrl,
      expiresInMinutes: RESET_TTL_MINUTES,
    });
    return { ok: true, expiresInMinutes: RESET_TTL_MINUTES };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    if (!rawToken) throw new BadRequestException('Missing token');
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const tokenHash = this.hashToken(rawToken);
    const user = await this.users.findByPasswordResetTokenHash(tokenHash);
    if (!user) throw new BadRequestException('Invalid or expired token');
    if (
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Reset link expired');
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    // A successful reset also confirms the user controls the inbox.
    user.emailVerified = true;
    await user.save();
    return { ok: true };
  }

  // ── Social login (Google / Apple) ──────────────────────────────────────

  /**
   * Verifies a Google ID token (obtained client-side by google_sign_in)
   * and issues our own JWT. Upserts the user on first sign-in.
   */
  async googleLogin(idToken: string) {
    if (!idToken) throw new BadRequestException('Missing idToken');
    // Lazy-require so apps that don't use google login don't need the lib
    // installed (it's listed in package.json though, so this is just a
    // guard against startup-time failures in minimal deployments).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OAuth2Client } = require('google-auth-library');
    const audiences = [
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_ID_IOS'),
      this.config.get<string>('GOOGLE_CLIENT_ID_ANDROID'),
      this.config.get<string>('GOOGLE_CLIENT_ID_WEB'),
    ].filter(Boolean) as string[];
    if (audiences.length === 0) {
      throw new BadRequestException('Google login is not configured');
    }
    const client = new OAuth2Client();
    let payload: any;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: audiences });
      payload = ticket.getPayload();
    } catch (e) {
      throw new UnauthorizedException(
        `Invalid Google token: ${(e as Error).message}`,
      );
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Google token missing identity');
    }
    const user = await this.users.upsertSocialUser({
      provider: 'google',
      providerUserId: payload.sub,
      email: (payload.email as string).toLowerCase(),
      firstName: payload.given_name || '',
      lastName: payload.family_name || '',
      photo: payload.picture || '',
    });
    return this.issue(user);
  }

  /**
   * Verifies an Apple identity token (JWT) by fetching Apple's JWKS and
   * validating signature + claims, then upserts the user and issues a JWT.
   */
  async appleLogin(opts: {
    identityToken: string;
    firstName?: string;
    lastName?: string;
  }) {
    if (!opts.identityToken) throw new BadRequestException('Missing identityToken');
    const audience = this.config.get<string>('APPLE_CLIENT_ID');
    if (!audience) throw new BadRequestException('Apple login is not configured');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jwt = require('jsonwebtoken');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jwksClientLib = require('jwks-rsa');
    const client = jwksClientLib({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      rateLimit: true,
    });
    const getKey = (header: any, cb: any) => {
      client.getSigningKey(header.kid, (err: any, key: any) => {
        if (err) return cb(err);
        cb(null, key.getPublicKey());
      });
    };
    const payload: any = await new Promise((resolve, reject) => {
      jwt.verify(
        opts.identityToken,
        getKey,
        {
          audience,
          issuer: 'https://appleid.apple.com',
          algorithms: ['RS256'],
        },
        (err: any, decoded: any) => (err ? reject(err) : resolve(decoded)),
      );
    }).catch((e: any) => {
      throw new UnauthorizedException(`Invalid Apple token: ${e.message}`);
    });
    if (!payload?.sub) throw new UnauthorizedException('Apple token missing sub');
    // Apple only surfaces email on first sign-in; subsequent sign-ins have
    // just `sub`. We accept either a real email or a private-relay email;
    // if truly missing we fall back to a synthetic placeholder.
    const email: string =
      (payload.email as string)?.toLowerCase() ||
      `${payload.sub}@privaterelay.appleid.com`;
    const user = await this.users.upsertSocialUser({
      provider: 'apple',
      providerUserId: payload.sub,
      email,
      firstName: opts.firstName || '',
      lastName: opts.lastName || '',
    });
    return this.issue(user);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Generates a new verification token + mails it. Respects rate limit. */
  private async issueAndSendVerification(
    user: any,
    opts: { respectRateLimit?: boolean } = {},
  ) {
    // Rate limit: if the current token is still valid, don't regenerate.
    // This is what prevents "relogin + resend" spam.
    if (
      opts.respectRateLimit &&
      user.emailVerificationExpiresAt &&
      user.emailVerificationExpiresAt.getTime() > Date.now()
    ) {
      return;
    }
    const rawToken = this.randomToken();
    user.emailVerificationTokenHash = this.hashToken(rawToken);
    user.emailVerificationExpiresAt = new Date(
      Date.now() + VERIFY_TTL_MINUTES * 60 * 1000,
    );
    user.emailVerificationLastSentAt = new Date();
    await user.save();

    const baseUrl = this.publicBaseUrl();
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${rawToken}`;
    await this.mailer.sendVerificationEmail({
      to: user.email,
      firstName: user.firstName || 'there',
      verifyUrl,
      expiresInMinutes: VERIFY_TTL_MINUTES,
    });
  }

  private randomToken(): string {
    // 32 bytes ≈ 64 hex chars → ~256 bits of entropy. URL-safe.
    return crypto.randomBytes(32).toString('hex');
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private publicBaseUrl(): string {
    const url = this.config.get<string>('PUBLIC_BASE_URL');
    return (url || 'http://localhost:3000').replace(/\/$/, '');
  }

  private async issue(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    const token = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '30d',
    });
    return { token, user: this.users.toPublic(user) };
  }
}
