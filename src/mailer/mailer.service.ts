import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as ejs from 'ejs';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Renders EJS templates and sends transactional email (verification,
 * password reset). All SMTP credentials come from env — see
 * `email-settings.md` for setup.
 *
 * When SMTP is not configured we fall back to logging the email to stdout
 * so local development still works without a real mailbox.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly templatesDir = path.join(__dirname, 'templates');
  // In dev we also keep the project-relative path in case of ts-node.
  private readonly srcTemplatesDir = path.join(
    process.cwd(),
    'src',
    'mailer',
    'templates',
  );

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = parseInt(this.config.get<string>('SMTP_PORT') || '587', 10);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP_HOST / SMTP_USER / SMTP_PASS not set — emails will be logged to stdout instead of delivered.',
      );
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // implicit TLS on 465, STARTTLS otherwise
      auth: { user, pass },
    });
  }

  /** Public: send the "verify your email" message. */
  async sendVerificationEmail(opts: {
    to: string;
    firstName: string;
    verifyUrl: string;
    expiresInMinutes: number;
  }) {
    const html = await this.render('verification', {
      firstName: opts.firstName,
      verifyUrl: opts.verifyUrl,
      expiresInMinutes: opts.expiresInMinutes,
      appName: 'Consora',
    });
    await this.send({
      to: opts.to,
      subject: 'Verify your Consora email',
      html,
    });
  }

  /** Public: send the "reset your password" message. */
  async sendPasswordResetEmail(opts: {
    to: string;
    firstName: string;
    resetUrl: string;
    expiresInMinutes: number;
  }) {
    const html = await this.render('password-reset', {
      firstName: opts.firstName,
      resetUrl: opts.resetUrl,
      expiresInMinutes: opts.expiresInMinutes,
      appName: 'Consora',
    });
    await this.send({
      to: opts.to,
      subject: 'Reset your Consora password',
      html,
    });
  }

  private async render(
    template: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const candidates = [
      path.join(this.templatesDir, `${template}.ejs`),
      path.join(this.srcTemplatesDir, `${template}.ejs`),
    ];
    const file = candidates.find((p) => fs.existsSync(p));
    if (!file) {
      throw new Error(
        `Email template "${template}.ejs" not found (looked in ${candidates.join(', ')})`,
      );
    }
    return ejs.renderFile(file, data, { async: true });
  }

  private async send(opts: { to: string; subject: string; html: string }) {
    const from =
      this.config.get<string>('SMTP_FROM') ||
      `Consora <${this.config.get<string>('SMTP_USER') || 'no-reply@consora.app'}>`;
    if (!this.transporter) {
      this.logger.log(
        `[dev-mail] would send to=${opts.to} subject="${opts.subject}"`,
      );
      this.logger.debug(opts.html);
      return;
    }
    try {
      await this.transporter.sendMail({ from, ...opts });
      this.logger.log(`sent email to=${opts.to} subject="${opts.subject}"`);
    } catch (e) {
      // Never surface SMTP errors to the caller — a failed email shouldn't
      // block signup/password-reset flows. The user can always hit Resend.
      this.logger.error(`smtp send failed to=${opts.to}: ${(e as Error).message}`);
    }
  }
}
