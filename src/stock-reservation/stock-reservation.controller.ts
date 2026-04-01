/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { StockReservationService } from './stock-reservation.service';
import {
  ReserveStockDto,
  ReleaseReservationDto,
  CheckAvailabilityDto,
} from './dto/stock-reservation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('stock-reservation')
export class StockReservationController {
  constructor(
    private readonly stockReservationService: StockReservationService,
  ) {}

  /**
   * Reserve stock for a variant
   * POST /stock-reservation/reserve
   */
  @UseGuards(JwtAuthGuard)
  @Post('reserve')
  async reserveStock(@Request() req, @Body() dto: ReserveStockDto) {
    return this.stockReservationService.reserveStock(
      req.user.id,
      dto.variantId,
      dto.quantity,
      dto.expirationMinutes,
    );
  }

  /**
   * Release a reservation
   * POST /stock-reservation/release
   */
  @UseGuards(JwtAuthGuard)
  @Post('release')
  async releaseReservation(@Request() req, @Body() dto: ReleaseReservationDto) {
    return this.stockReservationService.releaseReservation(
      dto.reservationId,
      req.user.id,
    );
  }

  /**
   * Get active reservations for the current user
   * GET /stock-reservation/my-reservations
   */
  @UseGuards(JwtAuthGuard)
  @Get('my-reservations')
  async getMyReservations(@Request() req) {
    return this.stockReservationService.getUserReservations(req.user.id);
  }

  /**
   * Get available stock for a variant (public endpoint)
   * GET /stock-reservation/available/:variantId
   */
  @Get('available/:variantId')
  async getAvailableStock(@Param('variantId') variantId: string) {
    return this.stockReservationService.getAvailableStock(Number(variantId));
  }

  /**
   * Check if stock is available (public endpoint)
   * POST /stock-reservation/check
   */
  @Post('check')
  async checkAvailability(@Body() dto: CheckAvailabilityDto) {
    return this.stockReservationService.checkAvailability(
      dto.variantId,
      dto.quantity,
    );
  }

  /**
   * Get reservation by ID
   * GET /stock-reservation/:id
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getReservation(@Param('id') id: string, @Request() req) {
    return this.stockReservationService.getReservationById(Number(id));
  }

  /**
   * Release expired reservations (admin/cron endpoint)
   * POST /stock-reservation/release-expired
   */
  @Post('release-expired')
  async releaseExpiredReservations() {
    return this.stockReservationService.releaseExpiredReservations();
  }
}
