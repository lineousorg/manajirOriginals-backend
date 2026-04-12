import { Module } from '@nestjs/common';
import { GuestUserService } from './guest-user.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [GuestUserService],
  exports: [GuestUserService],
})
export class GuestUserModule {}
