/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GuestUser } from '@prisma/client';

@Injectable()
export class GuestUserService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find or create a guest user based on phone number
   * If a guest with the same phone exists, returns the existing record
   * Otherwise creates a new guest user record
   */
  async findOrCreate(data: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    city?: string;
    postalCode?: string;
  }): Promise<GuestUser> {
    // Try to find existing guest by phone number
    const existingGuest = await this.prisma.guestUser.findUnique({
      where: { phone: data.phone },
    });

    if (existingGuest) {
      // Update existing guest with new details
      return this.prisma.guestUser.update({
        where: { id: existingGuest.id },
        data: {
          name: data.name,
          email: data.email,
          address: data.address,
          city: data.city,
          postalCode: data.postalCode,
        },
      });
    }

    // Create new guest user
    return this.prisma.guestUser.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        postalCode: data.postalCode,
      },
    });
  }

  /**
   * Find guest user by phone number
   */
  async findByPhone(phone: string): Promise<GuestUser | null> {
    return await this.prisma.guestUser.findUnique({
      where: { phone },
    });
  }

  /**
   * Find guest user by ID
   */
  async findById(id: number): Promise<GuestUser | null> {
    return await this.prisma.guestUser.findUnique({
      where: { id },
    });
  }
}
