import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAttributeValueDto,
  UpdateAttributeValueDto,
} from './dto/create-attribute-value.dto';
import { AttributeValue } from '@prisma/client';

@Injectable()
export class AttributeValueService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new attribute value
   * Example: For attribute "Color", create values "Red", "Blue", "Green"
   */
  async create(dto: CreateAttributeValueDto): Promise<{
    message: string;
    status: string;
    data: AttributeValue;
  }> {
    // Check if attribute exists
    const attribute = await this.prisma.attribute.findUnique({
      where: { id: dto.attributeId },
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    // Check if value already exists for this attribute
    const existing = await this.prisma.attributeValue.findFirst({
      where: {
        value: dto.value,
        attributeId: dto.attributeId,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Attribute value already exists for this attribute',
      );
    }

    const attributeValue = await this.prisma.attributeValue.create({
      data: {
        value: dto.value,
        attributeId: dto.attributeId,
      },
    });

    return {
      message: 'Attribute value created successfully',
      status: 'success',
      data: attributeValue,
    };
  }

  /**
   * Get all attribute values
   */
  async findAll(): Promise<{
    message: string;
    status: string;
    data: AttributeValue[];
  }> {
    const attributeValues = await this.prisma.attributeValue.findMany({
      include: {
        attribute: true,
      },
      orderBy: { value: 'asc' },
    });

    return {
      message:
        attributeValues.length > 0
          ? 'Attribute values retrieved successfully'
          : 'No attribute values found',
      status: 'success',
      data: attributeValues,
    };
  }

  /**
   * Get all values for a specific attribute
   */
  async findByAttribute(attributeId: number): Promise<{
    message: string;
    status: string;
    data: AttributeValue[];
  }> {
    // Check if attribute exists
    const attribute = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    const attributeValues = await this.prisma.attributeValue.findMany({
      where: { attributeId },
      orderBy: { value: 'asc' },
    });

    return {
      message:
        attributeValues.length > 0
          ? 'Attribute values retrieved successfully'
          : 'No values found for this attribute',
      status: 'success',
      data: attributeValues,
    };
  }

  /**
   * Get a single attribute value by ID
   */
  async findOne(id: number): Promise<{
    message: string;
    status: string;
    data: AttributeValue;
  }> {
    const attributeValue = await this.prisma.attributeValue.findUnique({
      where: { id },
      include: {
        attribute: true,
      },
    });

    if (!attributeValue) {
      throw new NotFoundException('Attribute value not found');
    }

    return {
      message: 'Attribute value retrieved successfully',
      status: 'success',
      data: attributeValue,
    };
  }

  /**
   * Update an attribute value
   */
  async update(
    id: number,
    dto: UpdateAttributeValueDto,
  ): Promise<{
    message: string;
    status: string;
    data: AttributeValue;
  }> {
    const existingValue = await this.prisma.attributeValue.findUnique({
      where: { id },
    });

    if (!existingValue) {
      throw new NotFoundException('Attribute value not found');
    }

    // Check if new value already exists for this attribute (if value is being changed)
    if (dto.value && dto.value !== existingValue.value) {
      const valueExists = await this.prisma.attributeValue.findFirst({
        where: {
          value: dto.value,
          attributeId: existingValue.attributeId,
          NOT: { id },
        },
      });

      if (valueExists) {
        throw new ConflictException(
          'Attribute value already exists for this attribute',
        );
      }
    }

    const attributeValue = await this.prisma.attributeValue.update({
      where: { id },
      data: {
        ...(dto.value && { value: dto.value }),
      },
    });

    return {
      message: 'Attribute value updated successfully',
      status: 'success',
      data: attributeValue,
    };
  }

  /**
   * Delete an attribute value
   * Note: This will also remove the value from all variant attributes
   */
  async remove(id: number): Promise<{
    message: string;
    status: string;
    data: null;
  }> {
    const existingValue = await this.prisma.attributeValue.findUnique({
      where: { id },
    });

    if (!existingValue) {
      throw new NotFoundException('Attribute value not found');
    }

    await this.prisma.attributeValue.delete({
      where: { id },
    });

    return {
      message: 'Attribute value deleted successfully',
      status: 'success',
      data: null,
    };
  }
}
