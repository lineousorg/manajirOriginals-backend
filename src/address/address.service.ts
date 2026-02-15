/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { Address } from '@prisma/client';

@Injectable()
export class AddressService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new address for a user
   * Security: Authenticated users can only create addresses for themselves
   */
  async create(
    userId: number,
    dto: CreateAddressDto,
  ): Promise<{
    message: string;
    status: string;
    data: Address;
  }> {
    // If this is set as default, unset other defaults
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await this.prisma.address.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        postalCode: dto.postalCode,
        country: dto.country,
        isDefault: dto.isDefault || false,
        userId,
      },
    });

    return {
      message: 'Address created successfully',
      status: 'success',
      data: address,
    };
  }

  /**
   * Get all addresses for a user
   * Security: Users can only view their own addresses
   */
  async findAll(userId: number): Promise<{
    message: string;
    status: string;
    data: Address[];
  }> {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });

    return {
      message:
        addresses.length > 0
          ? 'Addresses retrieved successfully'
          : 'No addresses found',
      status: 'success',
      data: addresses,
    };
  }

  /**
   * Get a single address by ID
   * Security: Users can only view their own addresses
   */
  async findOne(
    id: number,
    userId: number,
  ): Promise<{
    message: string;
    status: string;
    data: Address;
  }> {
    const address = await this.prisma.address.findUnique({
      where: { id },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    // Security: Check if user owns this address
    if (address.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to view this address',
      );
    }

    return {
      message: 'Address retrieved successfully',
      status: 'success',
      data: address,
    };
  }

  /**
   * Update an address
   * Security: Users can only update their own addresses
   */
  async update(
    id: number,
    userId: number,
    dto: UpdateAddressDto,
  ): Promise<{
    message: string;
    status: string;
    data: Address;
  }> {
    const existingAddress = await this.prisma.address.findUnique({
      where: { id },
    });

    if (!existingAddress) {
      throw new NotFoundException('Address not found');
    }

    // Security: Check if user owns this address
    if (existingAddress.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this address',
      );
    }

    // If setting as default, unset other defaults first
    if (dto.isDefault && !existingAddress.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const address = await this.prisma.address.update({
      where: { id },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.address && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });

    return {
      message: 'Address updated successfully',
      status: 'success',
      data: address,
    };
  }

  /**
   * Delete an address
   * Security: Users can only delete their own addresses
   */
  async remove(
    id: number,
    userId: number,
  ): Promise<{
    message: string;
    status: string;
    data: null;
  }> {
    const address = await this.prisma.address.findUnique({
      where: { id },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    // Security: Check if user owns this address
    if (address.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this address',
      );
    }

    await this.prisma.address.delete({
      where: { id },
    });

    return {
      message: 'Address deleted successfully',
      status: 'success',
      data: null,
    };
  }

  /**
   * Set an address as default
   * Security: Users can only set their own addresses as default
   */
  async setDefault(
    id: number,
    userId: number,
  ): Promise<{
    message: string;
    status: string;
    data: Address;
  }> {
    const address = await this.prisma.address.findUnique({
      where: { id },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    // Security: Check if user owns this address
    if (address.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this address',
      );
    }

    // Unset all other defaults
    await this.prisma.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this as default
    const updatedAddress = await this.prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });

    return {
      message: 'Address set as default successfully',
      status: 'success',
      data: updatedAddress,
    };
  }
}
