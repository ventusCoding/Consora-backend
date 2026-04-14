import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as bcrypt from 'bcryptjs';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';

async function seedAdmin(app: NestExpressApplication) {
  try {
    const users = app.get(UsersService);
    const email = (process.env.ADMIN_EMAIL || 'admin@consora.com').toLowerCase();
    const existing = await users.findByEmail(email);
    if (existing) return;
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin12345', 10);
    await users.create({
      firstName: process.env.ADMIN_FIRST_NAME || 'Consora',
      lastName: process.env.ADMIN_LAST_NAME || 'Admin',
      email,
      password: hash,
      role: 'admin',
      trustScore: 100,
      emailVerified: true,
      authProvider: 'local',
    });
    console.log('[seed] admin user created:', email);
  } catch (e) {
    console.error('[seed] failed to create admin:', e);
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const uploadDir = process.env.UPLOAD_DIR || 'uploads';
  app.useStaticAssets(join(process.cwd(), uploadDir), { prefix: '/uploads/' });

  await seedAdmin(app);

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[consora-api] http://localhost:${port}/api`);
}

bootstrap();
