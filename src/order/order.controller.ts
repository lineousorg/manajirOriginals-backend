import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';

/**
 * Request interface with user from JWT
 */
interface RequestWithUser extends Request {
  user: {
    id: number;
    email: string;
    role: Role;
  };
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * Create a new order
   * Access: Authenticated customers and admins
   */
  @Post()
  create(@Request() req: RequestWithUser, @Body() dto: CreateOrderDto) {
    return this.orderService.create(req.user.id, dto);
  }

  /**
   * Get all orders
   * Access: Admins see all orders, customers see only their own
   */
  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.orderService.findAll(req.user.id, req.user.role);
  }

  /**
   * Get a single order by ID
   * Access: Admins can view any order, customers can view only their own
   */
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ) {
    return this.orderService.findOne(id, req.user.id, req.user.role);
  }

  /**
   * Update order status
   * Access: Admins only
   */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
    @Request() req: RequestWithUser,
  ) {
    return this.orderService.updateStatus(id, dto, req.user.id, req.user.role);
  }
}
