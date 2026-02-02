/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { VariantWithAttributesDto } from './dto/create-product-with-attribute.dto';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        isActive: dto.isActive ?? true,
        slug: dto.slug,
        variants: dto.variants
          ? {
              create: dto.variants.map((v: VariantWithAttributesDto) => ({
                sku:
                  v.sku ??
                  `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                price: v.price,
                stock: v.stock,
                ...(v.attributes && {
                  attributes: {
                    create: v.attributes.map((a) => ({
                      attributeValueId: a.valueId,
                    })),
                  },
                }),
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        variants: {
          include: {
            attributes: {
              include: {
                attributeValue: {
                  include: {
                    attribute: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return {
      message: 'Product created successfully',
      status: 'success',
      data: product,
    };
  }

  async findAll() {
    const products = await this.prisma.product.findMany({
      include: { category: true, variants: true },
    });
    return {
      message: products.length > 0 ? 'Products found' : 'No products found',
      status: 'success',
      data: products,
    };
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, variants: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return {
      message: 'Product found',
      status: 'success',
      data: product,
    };
  }

  async update(id: number, dto: UpdateProductDto) {
    await this.findOne(id);

    const { categoryId, variants, ...rest } = dto;

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        // Don't include price/isFeatured/isBest

        ...(categoryId && {
          category: {
            connect: { id: categoryId },
          },
        }),

        ...(variants && {
          variants: {
            deleteMany: {},
            create: variants.map((v) => ({
              sku: v.sku,
              price: v.price,
              stock: v.stock,
            })),
          },
        }),
      },
      include: {
        category: true,
        variants: true,
      },
    });

    return {
      message: 'Product updated successfully',
      data: product,
    };
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    return {
      message: 'Product deleted successfully',
      status: 'success',
      data: null,
    };
  }
}
