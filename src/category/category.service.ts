/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  PaginationQueryDto,
  PaginatedResponse,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    // Check if slug already exists (among non-deleted categories)
    const existing = await this.prisma.category.findUnique({
      where: { slug: dto.slug, isDeleted: false },
    });

    if (existing) {
      throw new ConflictException('Category with this slug already exists');
    }

    // Validate parentId if provided and check for circular reference
    if (dto.parentId) {
      await this.validateParentCategory(dto.parentId);
    }

    // Use transaction for atomicity
    const category = await this.prisma.$transaction(async (tx) => {
      try {
        const created = await tx.category.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            parentId: dto.parentId ?? null,
            isActive: dto.isActive ?? true,
            images: dto.images
              ? {
                  create: dto.images.map((img, index) => ({
                    url: img.url,
                    altText: img.altText ?? null,
                    position: img.position ?? index,
                    type: 'CATEGORY',
                  })),
                }
              : undefined,
          },
          include: {
            parent: true,
            children: true,
            images: true,
          },
        });
        return created;
      } catch (error: any) {
        // Handle unique constraint violation (slug race condition)
        if (error.code === 'P2002') {
          throw new ConflictException('Category with this slug already exists');
        }
        throw error;
      }
    });

    return {
      message: 'Category created successfully',
      status: 'success',
      data: category,
    };
  }

  async update(id: number, dto: UpdateCategoryDto) {
    // Check if category exists
    const existing = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    // Check if slug is being changed and if it's already taken
    if (dto.slug && dto.slug !== existing.slug) {
      const slugTaken = await this.prisma.category.findUnique({
        where: { slug: dto.slug, isDeleted: false },
      });

      if (slugTaken) {
        throw new ConflictException('Category with this slug already exists');
      }
    }

    // Validate parentId if provided and check for circular reference
    if (dto.parentId && dto.parentId !== existing.parentId) {
      // Prevent setting itself as parent
      if (dto.parentId === id) {
        throw new ConflictException('Category cannot be its own parent');
      }

      await this.validateParentCategory(dto.parentId, id);
    }

    // Extract images from dto
    const { images, ...rest } = dto;

    // Remove undefined values
    const updateData: any = { ...rest };
    if (dto.parentId !== undefined) {
      updateData.parentId = dto.parentId;
    }

    // Use transaction for atomicity
    const category = await this.prisma.$transaction(async (tx) => {
      try {
        // Handle images update if provided
        if (images && images.length > 0) {
          // Simple approach: delete all existing images and create new ones
          // This is atomic within the transaction
          await tx.image.deleteMany({ where: { categoryId: id } });
          await tx.image.createMany({
            data: images.map((img, index) => ({
              url: img.url!,
              altText: img.altText ?? null,
              position: img.position ?? index,
              type: 'CATEGORY',
              categoryId: id,
            })),
          });
        }

        const updated = await tx.category.update({
          where: { id },
          data: updateData,
          include: {
            parent: true,
            children: true,
            images: true,
          },
        });
        return updated;
      } catch (error: any) {
        if (error.code === 'P2002') {
          throw new ConflictException('Category with this slug already exists');
        }
        throw error;
      }
    });

    return {
      message: 'Category updated successfully',
      status: 'success',
      data: category,
    };
  }

  async findAll(
    pagination: PaginationQueryDto,
  ): Promise<PaginatedResponse<any>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const whereClause = { isDeleted: false };

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
          parent: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          children: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          images: {
            select: {
              id: true,
              url: true,
              altText: true,
              position: true,
            },
            orderBy: { position: 'asc' },
          },
          _count: {
            select: { products: { where: { isDeleted: false } } },
          },
        },
      }),
      this.prisma.category.count({ where: whereClause }),
    ]);

    return createPaginatedResponse(
      categories,
      total,
      page,
      limit,
      categories.length > 0 ? 'Categories found' : 'No categories found',
    );
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        isDeleted: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
        images: {
          select: {
            id: true,
            url: true,
            altText: true,
            position: true,
          },
          orderBy: { position: 'asc' },
        },
        _count: {
          select: { products: { where: { isDeleted: false } } },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if category is soft-deleted
    if (category.isDeleted) {
      throw new NotFoundException('Category not found');
    }

    return {
      message: 'Category found',
      status: 'success',
      data: category,
    };
  }

  async toggleStatus(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if category has children - prevent toggle if children exist
    const childCount = await this.prisma.category.count({
      where: { parentId: id, isDeleted: false },
    });

    if (childCount > 0) {
      throw new ConflictException(
        'Cannot toggle status of category with subcategories. Please toggle subcategories first.',
      );
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        isActive: !category.isActive,
      },
    });

    return {
      message: `Category is now ${updated.isActive ? 'active' : 'inactive'}`,
      status: 'success',
      data: updated,
    };
  }

  async remove(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if already soft-deleted
    if (category.isDeleted) {
      throw new ConflictException('Category already deleted');
    }

    // Check if category has products (including non-deleted)
    const productCount = await this.prisma.product.count({
      where: { categoryId: id, isDeleted: false },
    });

    if (productCount > 0) {
      throw new ConflictException(
        'Cannot delete category with associated products',
      );
    }

    // Check if category has children (non-deleted)
    const childCount = await this.prisma.category.count({
      where: { parentId: id, isDeleted: false },
    });

    if (childCount > 0) {
      throw new ConflictException('Cannot delete category with subcategories');
    }

    // Soft delete
    await this.prisma.category.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return {
      message: 'Category deleted successfully',
      status: 'success',
      data: null,
    };
  }

  // Helper method to validate parent category and check for circular references
  private async validateParentCategory(parentId: number, currentId?: number) {
    // Check if parent exists and is not soft-deleted
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundException('Parent category not found');
    }

    if (parent.isDeleted) {
      throw new ConflictException(
        'Cannot use a soft-deleted category as parent',
      );
    }

    // Check for circular reference (only if currentId is provided - i.e., during update)
    if (currentId !== undefined) {
      let ancestor = parent;
      while (ancestor.parentId) {
        if (ancestor.parentId === currentId) {
          throw new ConflictException('Circular category reference detected');
        }
        const nextAncestor = await this.prisma.category.findUnique({
          where: { id: ancestor.parentId },
        });
        if (!nextAncestor) break;
        ancestor = nextAncestor;
      }
    }
  }
}
