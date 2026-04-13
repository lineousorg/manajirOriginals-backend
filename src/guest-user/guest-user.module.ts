import { Module } from '@nestjs/common';
import { GuestUserService } from './guest-user.service';
import { GuestUserController } from './guest-user.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GuestUserController],
  providers: [GuestUserService],
  exports: [GuestUserService],
})
export class GuestUserModule {}
