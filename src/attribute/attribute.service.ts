import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttributeDto, UpdateAttributeDto } from './dto/create-attribute.dto';
import { Attribute } from '@prisma/client';

@Injectable()
export class AttributeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new attribute
   * Example: "Color", "Size", "Material"
   */
  async create(dto: CreateAttributeDto): Promise<{
    message: string;
    status: string;
    data: Attribute;
  }> {
    // Check if attribute with same name already exists
    const existing = await this.prisma.attribute.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Attribute with this name already exists');
    }

    const attribute = await this.prisma.attribute.create({
      data: {
        name: dto.name,
      },
    });

    return {
      message: 'Attribute created successfully',
      status: 'success',
      data: attribute,
    };
  }

  /**
   * Get all attributes with their values
   */
  async findAll(): Promise<{
    message: string;
    status: string;
    data: Attribute[];
  }> {
    const attributes = await this.prisma.attribute.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      message: attributes.length > 0 ? 'Attributes retrieved successfully' : 'No attributes found',
      status: 'success',
      data: attributes,
    };
  }

  /**
   * Get a single attribute by ID with its values
   */
  async findOne(id: number): Promise<{
    message: string;
    status: string;
    data: Attribute;
  }> {
    const attribute = await this.prisma.attribute.findUnique({
      where: { id },
      include: {
        values: {
          orderBy: { value: 'asc' },
        },
      },
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    return {
      message: 'Attribute retrieved successfully',
      status: 'success',
      data: attribute,
    };
  }

  /**
   * Update an attribute
   */
  async update(
    id: number,
    dto: UpdateAttributeDto,
  ): Promise<{
    message: string;
    status: string;
    data: Attribute;
  }> {
    const existingAttribute = await this.prisma.attribute.findUnique({
      where: { id },
    });

    if (!existingAttribute) {
      throw new NotFoundException('Attribute not found');
    }

    // Check if new name already exists (if name is being changed)
    if (dto.name && dto.name !== existingAttribute.name) {
      const nameExists = await this.prisma.attribute.findUnique({
        where: { name: dto.name },
      });

      if (nameExists) {
        throw new ConflictException('Attribute with this name already exists');
      }
    }

    const attribute = await this.prisma.attribute.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
      },
    });

    return {
      message: 'Attribute updated successfully',
      status: 'success',
      data: attribute,
    };
  }

  /**
   * Delete an attribute
   * Note: This will also delete all associated attribute values
   */
  async remove(id: number): Promise<{
    message: string;
    status: string;
    data: null;
  }> {
    const existingAttribute = await this.prisma.attribute.findUnique({
      where: { id },
    });

    if (!existingAttribute) {
      throw new NotFoundException('Attribute not found');
    }

    await this.prisma.attribute.delete({
      where: { id },
    });

    return {
      message: 'Attribute deleted successfully',
      status: 'success',
      data: null,
    };
  }
}
