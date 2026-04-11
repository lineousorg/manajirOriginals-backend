import { Module } from '@nestjs/common';
import { GuestUserService } from './guest-user.service';

@Module({
  providers: [GuestUserService],
  exports: [GuestUserService],
})
export class GuestUserModule {}
