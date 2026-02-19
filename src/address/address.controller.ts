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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';

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

@ApiTags('Addresses')
@ApiBearerAuth('JWT-auth')
@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  /**
   * Create a new address
   * Access: Authenticated users (their own addresses only)
   */
  @Post()
  @ApiOperation({ summary: 'Create a new address', description: 'Authenticated users only' })
  @ApiBody({ type: CreateAddressDto })
  @ApiResponse({ status: 201, description: 'Address created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Request() req: RequestWithUser, @Body() dto: CreateAddressDto) {
    return this.addressService.create(req.user.id, dto);
  }

  /**
   * Get all addresses for the authenticated user
   * Access: Authenticated users (their own addresses only)
   */
  @Get()
  @ApiOperation({ summary: 'Get all addresses', description: 'Returns user\'s own addresses' })
  @ApiResponse({ status: 200, description: 'Returns all addresses' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(@Request() req: RequestWithUser) {
    return this.addressService.findAll(req.user.id);
  }

  /**
   * Get a single address by ID
   * Access: Owner only
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get an address by ID', description: 'Owner only' })
  @ApiParam({ name: 'id', type: Number, description: 'Address ID' })
  @ApiResponse({ status: 200, description: 'Returns the address' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
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
  @ApiOperation({ summary: 'Update an address', description: 'Owner only' })
  @ApiParam({ name: 'id', type: Number, description: 'Address ID' })
  @ApiBody({ type: UpdateAddressDto })
  @ApiResponse({ status: 200, description: 'Address updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
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
  @ApiOperation({ summary: 'Delete an address', description: 'Owner only' })
  @ApiParam({ name: 'id', type: Number, description: 'Address ID' })
  @ApiResponse({ status: 200, description: 'Address deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
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
  @ApiOperation({ summary: 'Set address as default', description: 'Owner only' })
  @ApiParam({ name: 'id', type: Number, description: 'Address ID' })
  @ApiResponse({ status: 200, description: 'Address set as default' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  setDefault(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ) {
    return this.addressService.setDefault(id, req.user.id);
  }
}
