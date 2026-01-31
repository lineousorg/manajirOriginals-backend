/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) { }
  async create(dto: CreateProductDto) {
    return await this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        categoryId: dto.categoryId,
        isFeatured: dto.isFeatured ?? false,
        isBest: dto.isBest ?? false,
        isActive: dto.isActive ?? true,

        variants: dto.variants
          ? {
            create: dto.variants,
          }
          : undefined,
      },
      include: {
        category: true,
        variants: true,
      },
    });
  }

  async findAll() {
    return await this.prisma.product.findMany({
      include: { category: true, variants: true },
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, variants: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: number, dto: UpdateProductDto) {
    await this.findOne(id);

    const { categoryId, variants, ...rest } = dto;

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...rest,

        ...(categoryId && {
          category: {
            connect: { id: categoryId },
          },
        }),

        ...(variants && {
          variants: {
            deleteMany: {},
            create: variants,
          },
        }),
      },
      include: {
        category: true,
        variants: true,
      },
    });

    // ✅ RETURN MESSAGE + DATA
    return {
      message: 'Product updated successfully',
      data: product,
    };
  }


  async remove(id: number) {
    await this.findOne(id); // check if exists
    return this.prisma.product.delete({ where: { id } });
  }
}
