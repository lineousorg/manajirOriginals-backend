import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new user
   * Security: Only admins can create users with different roles
   */
  async create(
    dto: CreateUserDto,
    requestingUserId: number,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Omit<User, 'password'>;
  }> {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Only admins can create users with roles other than CUSTOMER
    if (
      dto.role &&
      dto.role !== Role.CUSTOMER &&
      requestingUserRole !== Role.ADMIN
    ) {
      throw new ForbiddenException(
        'Only administrators can create admin users',
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        role: dto.role || Role.CUSTOMER,
      },
    });

    // Return user without password
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pwd, ...userWithoutPassword } = user;

    return {
      message: 'User created successfully',
      status: 'success',
      data: userWithoutPassword,
    };
  }

  /**
   * Get all users
   * Security: Admins only
   */
  async findAll(
    requestingUserId: number,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Omit<User, 'password'>[];
  }> {
    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can view all users');
    }

    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Remove passwords from response
    // Remove passwords from response
    const usersWithoutPassword = users.map((u) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...rest } = u;
      return rest;
    });

    return {
      message:
        users.length > 0 ? 'Users retrieved successfully' : 'No users found',
      status: 'success',
      data: usersWithoutPassword,
    };
  }

  /**
   * Get a single user by ID
   * Security: Users can view their own profile, admins can view any
   */
  async findOne(
    id: number,
    requestingUserId: number,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Omit<User, 'password'>;
  }> {
    // Users can only view their own profile unless they're admin
    if (requestingUserRole !== Role.ADMIN && requestingUserId !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        orders: {
          select: {
            id: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Remove password from response
    // Remove password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;

    return {
      message: 'User retrieved successfully',
      status: 'success',
      data: userWithoutPassword,
    };
  }

  /**
   * Update a user
   * Security: Users can update their own profile, admins can update any
   */
  async update(
    id: number,
    dto: UpdateUserDto,
    requestingUserId: number,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Omit<User, 'password'>;
  }> {
    // Users can only update their own profile unless they're admin
    if (requestingUserRole !== Role.ADMIN && requestingUserId !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }

    // Only admins can change roles
    if (dto.role && requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can change user roles');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // If email is being changed, check if it's already taken
    if (dto.email && dto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (emailExists) {
        throw new ConflictException('Email already in use');
      }
    }

    // If password is being changed, hash it
    const updateData: { email?: string; password?: string; role?: Role } = {};
    if (dto.email) updateData.email = dto.email;
    if (dto.password) updateData.password = await bcrypt.hash(dto.password, 10);
    if (dto.role) updateData.role = dto.role;

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pwd, ...userWithoutPassword } = user;

    return {
      message: 'User updated successfully',
      status: 'success',
      data: userWithoutPassword,
    };
  }

  /**
   * Delete a user
   * Security: Admins only
   */
  async remove(
    id: number,
    requestingUserId: number,
    requestingUserRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: null;
  }> {
    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can delete users');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent admin from deleting themselves
    if (id === requestingUserId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return {
      message: 'User deleted successfully',
      status: 'success',
      data: null,
    };
  }
}
