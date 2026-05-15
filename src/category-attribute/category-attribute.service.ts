/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryAttributeDto,
  UpdateCategoryAttributeDto,
} from './dto/create-category-attribute.dto';

@Injectable()
export class CategoryAttributeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolve a category identifier (slug or ID string) to a category ID.
   * Supports both slug strings and numeric ID strings.
   */
  private async resolveCategoryId(slug: string): Promise<number> {
    const isId = /^\d+$/.test(slug);

    if (isId) {
      const category = await this.prisma.category.findUnique({
        where: { id: parseInt(slug, 10) },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException(`Category not found: ${slug}`);
      }
      return category.id;
    }

    const category = await this.prisma.category.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException(`Category not found: ${slug}`);
    }

    return category.id;
  }

  /**
   * Get all attributes assigned to a category (by slug or ID).
   * Traverses parent hierarchy to include inherited attributes.
   */
  async getByCategorySlug(slug: string) {
    const categoryId = await this.resolveCategoryId(slug);

    const categoryIds = await this.collectAncestorIds(categoryId);
    categoryIds.push(categoryId);

    const categoryAttributes = await this.prisma.categoryAttribute.findMany({
      where: {
        categoryId: { in: categoryIds },
        attribute: { isDeleted: false },
      },
      include: {
        attribute: {
          include: {
            values: {
              where: { isDeleted: false },
              orderBy: { value: 'asc' },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      message: 'Category attributes retrieved successfully',
      status: 'success',
      data: categoryAttributes,
    };
  }

  /**
   * Assign an attribute to a category
   */
  async assignAttribute(slug: string, dto: CreateCategoryAttributeDto) {
    const categoryId = await this.resolveCategoryId(slug);

    const attribute = await this.prisma.attribute.findUnique({
      where: { id: dto.attributeId },
    });

    if (!attribute || attribute.isDeleted) {
      throw new NotFoundException('Attribute not found');
    }

    const existing = await this.prisma.categoryAttribute.findUnique({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId: dto.attributeId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Attribute is already assigned to this category',
      );
    }

    const categoryAttribute = await this.prisma.categoryAttribute.create({
      data: {
        categoryId,
        attributeId: dto.attributeId,
        sortOrder: dto.sortOrder ?? 0,
        isRequired: dto.isRequired ?? false,
        isVariantSelectable: dto.isVariantSelectable ?? true,
      },
      include: {
        attribute: {
          include: { values: { where: { isDeleted: false } } },
        },
      },
    });

    return {
      message: 'Attribute assigned to category successfully',
      status: 'success',
      data: categoryAttribute,
    };
  }

  /**
   * Remove an attribute from a category
   */
  async removeAttribute(slug: string, attributeId: number) {
    const categoryId = await this.resolveCategoryId(slug);

    const categoryAttribute = await this.prisma.categoryAttribute.findUnique({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
    });

    if (!categoryAttribute) {
      throw new NotFoundException('Attribute is not assigned to this category');
    }

    await this.prisma.categoryAttribute.delete({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
    });

    return {
      message: 'Attribute removed from category successfully',
      status: 'success',
      data: null,
    };
  }

  /**
   * Update category attribute settings (sortOrder, isRequired, isVariantSelectable)
   */
  async updateAttribute(
    slug: string,
    attributeId: number,
    dto: UpdateCategoryAttributeDto,
  ) {
    const categoryId = await this.resolveCategoryId(slug);

    const categoryAttribute = await this.prisma.categoryAttribute.findUnique({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
    });

    if (!categoryAttribute) {
      throw new NotFoundException('Attribute is not assigned to this category');
    }

    const updated = await this.prisma.categoryAttribute.update({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
      data: {
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
        ...(dto.isVariantSelectable !== undefined && {
          isVariantSelectable: dto.isVariantSelectable,
        }),
      },
      include: {
        attribute: {
          include: { values: { where: { isDeleted: false } } },
        },
      },
    });

    return {
      message: 'Category attribute updated successfully',
      status: 'success',
      data: updated,
    };
  }

  /**
   * Helper: recursively collect all ancestor category IDs
   */
  private async collectAncestorIds(
    categoryId: number,
    ids: number[] = [],
  ): Promise<number[]> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { parentId: true },
    });

    if (category?.parentId) {
      ids.push(category.parentId);
      await this.collectAncestorIds(category.parentId, ids);
    }

    return ids;
  }
}
