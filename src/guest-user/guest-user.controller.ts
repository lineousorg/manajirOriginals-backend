import { Controller, Get, Query } from '@nestjs/common';
import { GuestUserService } from './guest-user.service';
import {
  PaginationQueryDto,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';

@Controller('guest-users')
export class GuestUserController {
  constructor(private readonly guestUserService: GuestUserService) {}

  @Get()
  async findAll(@Query() pagination: PaginationQueryDto) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const [guestUsers, total] = await Promise.all([
      this.guestUserService.findAll({ skip, take: limit }),
      this.guestUserService.count(),
    ]);

    return createPaginatedResponse(
      guestUsers,
      total,
      page,
      limit,
      guestUsers.length > 0
        ? 'Guest users retrieved successfully'
        : 'No guest users found',
    );
  }
}
