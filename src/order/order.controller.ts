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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';

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

@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * Create a new order
   * Access: Authenticated customers and admins
   */
  @Post()
  @ApiOperation({ summary: 'Create a new order', description: 'Authenticated users only' })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Request() req: RequestWithUser, @Body() dto: CreateOrderDto) {
    return this.orderService.create(req.user.id, dto);
  }

  /**
   * Get all orders
   * Access: Admins see all orders, customers see only their own
   */
  @Get()
  @ApiOperation({ summary: 'Get all orders', description: 'Admins see all, customers see their own' })
  @ApiResponse({ status: 200, description: 'Returns orders' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(@Request() req: RequestWithUser) {
    return this.orderService.findAll(req.user.id, req.user.role);
  }

  /**
   * Get a single order by ID
   * Access: Admins can view any order, customers can view only their own
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get an order by ID', description: 'Admins can view any, customers can view their own' })
  @ApiParam({ name: 'id', type: Number, description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Returns the order' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
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
  @ApiOperation({ summary: 'Update order status', description: 'Requires ADMIN role' })
  @ApiParam({ name: 'id', type: Number, description: 'Order ID' })
  @ApiBody({ type: UpdateOrderStatusDto })
  @ApiResponse({ status: 200, description: 'Order status updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
    @Request() req: RequestWithUser,
  ) {
    return this.orderService.updateStatus(id, dto, req.user.id, req.user.role);
  }

  /**
   * Download order receipt as PDF
   * Access: Admins can download any order, customers can download only their own
   */
  @Get(':id/receipt')
  @ApiOperation({ summary: 'Download order receipt as PDF', description: 'Admins can download any, customers can download their own' })
  @ApiParam({ name: 'id', type: Number, description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Returns PDF receipt' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async downloadReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
    @Res() res: Response,
  ) {
    const receiptBuffer = await this.orderService.generateReceipt(
      id,
      req.user.id,
      req.user.role,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${id}.pdf"`,
      'Content-Length': receiptBuffer.length,
    });

    res.end(receiptBuffer);
  }
}
