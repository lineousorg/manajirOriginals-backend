/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { VariantWithAttributesDto } from './dto/create-product-with-attribute.dto';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    // Check if slug already exists
    const existingProduct = await this.prisma.product.findUnique({
      where: { slug: dto.slug },
    });

    if (existingProduct) {
      throw new ConflictException('Product with this slug already exists');
    }

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        images: dto.images
          ? {
              create: dto.images.map((img, index) => ({
                url: img.url,
                altText: img.altText ?? null,
                position: img.position ?? index,
                type: 'PRODUCT',
              })),
            }
          : undefined,
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
      include: { category: true, variants: true, images: true },
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
      include: { category: true, variants: true, images: true },
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

    const { categoryId, variants, images, ...rest } = dto;

    // Use transaction to handle foreign key constraints
    const product = await this.prisma.$transaction(async (tx) => {
      // Delete variant attributes first, then variants
      if (variants) {
        // Get existing variant IDs
        const existingVariants = await tx.productVariant.findMany({
          where: { productId: id },
          select: { id: true },
        });

        // Delete variant attributes for each variant
        for (const variant of existingVariants) {
          await tx.variantAttribute.deleteMany({
            where: { variantId: variant.id },
          });
        }

        // Delete variants
        await tx.productVariant.deleteMany({
          where: { productId: id },
        });
      }

      // Update product
      return tx.product.update({
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
              create: variants.map((v) => ({
                sku: v.sku,
                price: v.price,
                stock: v.stock,
              })),
            },
          }),

          ...(images && {
            images: {
              deleteMany: {},
              create: images.map((img, index) => ({
                url: img.url,
                altText: img.altText ?? null,
                position: img.position ?? index,
                type: 'PRODUCT',
              })),
            },
          }),
        },
        include: {
          category: true,
          variants: true,
          images: true,
        },
      });
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
