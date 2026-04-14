import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';
import { ChallengesService } from './challenges/challenges.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const users = app.get(UsersService);
  const challenges = app.get(ChallengesService);

  const email = (process.env.ADMIN_EMAIL || 'admin@consora.com').toLowerCase();
  let admin = await users.findByEmail(email);
  if (!admin) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin12345', 10);
    admin = await users.create({
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
  } else {
    console.log('[seed] admin user exists:', email);
  }

  const existing = await challenges.list({});
  if (existing.length === 0) {
    const now = Date.now();
    const day = 86400000;
    const samples = [
      {
        name: '75 Hard Challenge',
        description:
          '75 days. No sugar, no alcohol, 45-minute daily workout. No excuses.',
        dailyRequirement: '45-min workout, no sugar, no alcohol',
        difficulty: 'hard' as const,
        category: 'Fitness',
        startDate: new Date(now - 2 * day).toISOString(),
        endDate: new Date(now + 73 * day).toISOString(),
      },
      {
        name: '30 Days of Code',
        description:
          'Sharpen your programming skills with daily coding challenges.',
        dailyRequirement: 'Complete 1 coding challenge',
        difficulty: 'medium' as const,
        category: 'Learning',
        startDate: new Date(now).toISOString(),
        endDate: new Date(now + 30 * day).toISOString(),
      },
      {
        name: 'Early Risers Club',
        description: 'Wake up at 5AM for 21 days and transform your mornings.',
        dailyRequirement: 'Wake up by 5:00 AM',
        difficulty: 'medium' as const,
        category: 'Wellness',
        startDate: new Date(now + day).toISOString(),
        endDate: new Date(now + 22 * day).toISOString(),
      },
      {
        name: 'Hydration Master',
        description: 'Drink at least 3L of water every day. Stay focused.',
        dailyRequirement: 'Drink 3L of water',
        difficulty: 'easy' as const,
        category: 'Wellness',
        startDate: new Date(now + 2 * day).toISOString(),
        endDate: new Date(now + 32 * day).toISOString(),
      },
    ];
    for (const s of samples) {
      await challenges.create(s as any, (admin as any)._id.toString(), 'admin');
    }
    console.log('[seed] created', samples.length, 'challenges');
  }

  await app.close();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
