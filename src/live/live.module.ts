import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LiveGateway } from './live.gateway';

@Module({
  imports: [AuthModule],
  providers: [LiveGateway],
  exports: [LiveGateway],
})
export class LiveModule {}
