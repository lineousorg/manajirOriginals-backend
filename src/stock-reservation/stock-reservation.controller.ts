/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { StockReservationService } from './stock-reservation.service';
import {
  ReserveStockDto,
  ReleaseReservationDto,
  CheckAvailabilityDto,
} from './dto/stock-reservation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role } from '@prisma/client';
import * as crypto from 'crypto';

/**
 * Extended request with optional user from JWT
 */
interface RequestWithUser extends Request {
  user?: {
    id: number;
    email: string;
    role: Role;
  };
  res?: any;
}

@Controller('stock-reservation')
export class StockReservationController {
  constructor(
    private readonly stockReservationService: StockReservationService,
  ) {}

  /**
   * Generate or retrieve guest token for anonymous session tracking
   * GET /stock-reservation/guest-token
   * Access: Public
   */
  @Get('guest-token')
  async getGuestToken(@Res() res: any) {
    let guestToken = await res.req?.cookies?.guestToken;

    if (!guestToken) {
      // Generate UUID-like token using crypto
      guestToken = crypto.randomBytes(16).toString('hex');
      // Set HTTP-only cookie (7 days)
      res.cookie('guestToken', guestToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    return {
      guestToken,
    };
  }

  /**
   * Reserve stock for a variant
   * POST /stock-reservation/reserve
   * Access: Public - works for both authenticated users and guest users
   * For guests, provide guestToken in the request body
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Post('reserve')
  async reserveStock(
    @Request() req: RequestWithUser,
    @Body() dto: ReserveStockDto,
  ) {
    const userId = req.user?.id ?? null;
    return this.stockReservationService.reserveStock(
      userId,
      dto.variantId,
      dto.quantity,
      dto.expirationMinutes,
      dto.guestToken,
    );
  }

  /**
   * Release a reservation
   * POST /stock-reservation/release
   * Access: Public - works for both authenticated users and guest users
   * For guests, provide guestToken in the request body
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Post('release')
  async releaseReservation(
    @Request() req: RequestWithUser,
    @Body() dto: ReleaseReservationDto,
  ) {
    const userId = req.user?.id ?? null;
    return this.stockReservationService.releaseReservation(
      dto.reservationId,
      userId,
      dto.guestToken,
    );
  }

  /**
   * Get active reservations for the current user
   * GET /stock-reservation/my-reservations
   * Access: Public - works for both authenticated users and guest users
   * For guests, provide guestToken as query parameter
   */
  @Get('my-reservations')
  async getMyReservations(
    @Request() req: RequestWithUser,
    @Query('guestToken') guestToken?: string,
  ) {
    const userId = req.user?.id ?? null;
    return this.stockReservationService.getUserReservations(userId, guestToken);
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

  /**
   * Force clean ALL reservations regardless of expiration
   * Admin endpoint for emergency cleanup
   * POST /stock-reservation/force-clean
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('force-clean')
  async forceCleanReservations() {
    return this.stockReservationService.forceCleanAllReservations();
  }
}
