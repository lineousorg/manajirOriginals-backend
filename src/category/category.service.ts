/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    // Check if slug already exists
    const existing = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException('Category with this slug already exists');
    }

    // Validate parentId if provided
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        parentId: dto.parentId ?? null,
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
        where: { slug: dto.slug },
      });

      if (slugTaken) {
        throw new ConflictException('Category with this slug already exists');
      }
    }

    // Validate parentId if provided
    if (dto.parentId && dto.parentId !== existing.parentId) {
      // Prevent setting itself as parent
      if (dto.parentId === id) {
        throw new ConflictException('Category cannot be its own parent');
      }

      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    // Extract images from dto and prepare update data
    const { images, ...rest } = dto;

    // Prepare update data - handle parentId separately
    const updateData: any = { ...rest };
    if (dto.parentId !== undefined) {
      updateData.parentId = dto.parentId;
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: {
        ...updateData,
        // Handle images update if provided
        ...(images && {
          images: {
            deleteMany: {},
            create: images.map((img, index) => ({
              url: img.url,
              altText: img.altText ?? null,
              position: img.position ?? index,
              type: 'CATEGORY',
            })),
          },
        }),
      },
      include: {
        parent: true,
        children: true,
        images: true,
      },
    });

    return {
      message: 'Category updated successfully',
      status: 'success',
      data: category,
    };
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      include: {
        parent: true,
        children: true,
        images: true,
        _count: {
          select: { products: true },
        },
      },
    });

    return {
      message:
        categories.length > 0 ? 'Categories found' : 'No categories found',
      status: 'success',
      data: categories,
    };
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        products: true,
        images: true,
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      message: 'Category found',
      status: 'success',
      data: category,
    };
  }

  async remove(id: number) {
    await this.findOne(id);

    // Check if category has products
    const productCount = await this.prisma.product.count({
      where: { categoryId: id },
    });

    if (productCount > 0) {
      throw new ConflictException(
        'Cannot delete category with associated products',
      );
    }

    // Check if category has children
    const childCount = await this.prisma.category.count({
      where: { parentId: id },
    });

    if (childCount > 0) {
      throw new ConflictException('Cannot delete category with subcategories');
    }

    await this.prisma.category.delete({
      where: { id },
    });

    return {
      message: 'Category deleted successfully',
      status: 'success',
      data: null,
    };
  }
}
