import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

/**
 * Request interface with user from JWT
 */
interface RequestWithUser extends Request {
  user: {
    id: number;
    email: string;
    role: string;
  };
}

@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  /**
   * Create a new address
   * Access: Authenticated users (their own addresses only)
   */
  @Post()
  create(@Request() req: RequestWithUser, @Body() dto: CreateAddressDto) {
    return this.addressService.create(req.user.id, dto);
  }

  /**
   * Get all addresses for the authenticated user
   * Access: Authenticated users (their own addresses only)
   */
  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.addressService.findAll(req.user.id);
  }

  /**
   * Get a single address by ID
   * Access: Owner only
   */
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ) {
    return this.addressService.findOne(id, req.user.id);
  }

  /**
   * Update an address
   * Access: Owner only
   */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
    @Request() req: RequestWithUser,
  ) {
    return this.addressService.update(id, req.user.id, dto);
  }

  /**
   * Delete an address
   * Access: Owner only
   */
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ) {
    return this.addressService.remove(id, req.user.id);
  }

  /**
   * Set an address as default
   * Access: Owner only
   */
  @Patch(':id/set-default')
  setDefault(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ) {
    return this.addressService.setDefault(id, req.user.id);
  }
}
