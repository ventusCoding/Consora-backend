import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { AppleLoginDto } from './dto/apple-login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  JwtUser,
} from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private users: UsersService,
    private config: ConfigService,
  ) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.email);
  }

  /**
   * Called when the user taps the link in the verification email. Renders
   * an HTML page — not JSON — since it's opened in a browser.
   */
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.auth.verifyEmail(token);
      res.type('html').send(this.renderVerifySuccessHtml());
    } catch (e) {
      res
        .status(400)
        .type('html')
        .send(this.renderVerifyErrorHtml((e as Error).message));
    }
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  /**
   * Bridge page: the email link lands here (on the backend), and we
   * redirect to the Flutter deep link so the mobile app opens at the
   * reset screen with the token pre-filled. If the link is opened on
   * desktop (where the deep link won't resolve), we fall back to a page
   * that tells the user to open the email on their phone.
   */
  @Get('reset-password-link')
  resetPasswordLink(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      res.status(400).type('html').send(this.renderResetErrorHtml());
      return;
    }
    const scheme = this.config.get<string>('APP_DEEP_LINK_SCHEME') || 'consora';
    const deepLink = `${scheme}://reset-password?token=${encodeURIComponent(token)}`;
    res.type('html').send(this.renderResetBridgeHtml(deepLink));
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Post('google')
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.auth.googleLogin(dto.idToken);
  }

  @Post('apple')
  appleLogin(@Body() dto: AppleLoginDto) {
    return this.auth.appleLogin({
      identityToken: dto.identityToken,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() u: JwtUser) {
    // Recompute trust on read so records from the old formula self-heal.
    const refreshed = await this.users.recomputeTrust(u.sub);
    const user = refreshed ?? (await this.users.findById(u.sub));
    return this.users.toPublic(user);
  }

  // ── HTML responses for browser-targeted endpoints ────────────────────

  private renderVerifySuccessHtml(): string {
    return this.shell({
      title: 'Email verified',
      emoji: '&#10004;',
      accent: '#10b981',
      heading: "You're all set",
      body: 'Your email has been verified. Return to the Consora app and sign in to continue.',
    });
  }

  private renderVerifyErrorHtml(reason: string): string {
    return this.shell({
      title: 'Verification failed',
      emoji: '&#9888;',
      accent: '#ef4444',
      heading: 'Link invalid or expired',
      body: `${reason}. Open the Consora app and tap <em>Resend</em>, or try logging in again — a fresh link will be emailed.`,
    });
  }

  private renderResetBridgeHtml(deepLink: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Open Consora</title>
<style>
  body{margin:0;padding:0;background:#0b1220;color:#e6edf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:480px;width:100%;background:#111a2e;border:1px solid #22304f;border-radius:16px;padding:32px;text-align:center;}
  .icon{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);margin:0 auto 18px;display:flex;align-items:center;justify-content:center;font-size:32px;color:#fff;}
  h1{margin:0 0 8px;font-size:22px;color:#e6edf7;}
  p{margin:0 0 18px;color:#a9b4c7;line-height:1.6;font-size:15px;}
  .btn{display:inline-block;padding:14px 28px;border-radius:12px;background:#3b82f6;color:#fff;font-weight:600;text-decoration:none;font-size:15px;}
  .hint{margin-top:20px;font-size:12px;color:#7d8aa1;line-height:1.55;}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">&#128273;</div>
    <h1>Opening Consora…</h1>
    <p>If the app didn't open automatically, tap the button below. If you're on a desktop, open this email on the phone where Consora is installed.</p>
    <a class="btn" href="${deepLink}">Open Consora app</a>
    <div class="hint">This link is single-use and expires after 30 minutes.</div>
  </div>
  <script>
    // Fire the deep link as soon as the page loads — the browser will
    // hand off to the app on iOS/Android. The visible button is a
    // manual fallback in case the automatic redirect is blocked.
    setTimeout(function(){ window.location.href = ${JSON.stringify(deepLink)}; }, 50);
  </script>
</body>
</html>`;
  }

  private renderResetErrorHtml(): string {
    return this.shell({
      title: 'Reset link invalid',
      emoji: '&#9888;',
      accent: '#ef4444',
      heading: 'Reset link invalid',
      body: 'This reset link is missing or malformed. Open the Consora app and request a new one.',
    });
  }

  private shell(p: {
    title: string;
    emoji: string;
    accent: string;
    heading: string;
    body: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${p.title}</title>
<style>
  body{margin:0;padding:0;background:#0b1220;color:#e6edf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:480px;width:100%;background:#111a2e;border:1px solid #22304f;border-radius:16px;padding:36px 32px;text-align:center;}
  .icon{width:64px;height:64px;border-radius:18px;background:${p.accent};margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:30px;color:#fff;}
  h1{margin:0 0 10px;font-size:22px;color:#e6edf7;}
  p{margin:0;color:#a9b4c7;line-height:1.6;font-size:15px;}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${p.emoji}</div>
    <h1>${p.heading}</h1>
    <p>${p.body}</p>
  </div>
</body>
</html>`;
  }
}
