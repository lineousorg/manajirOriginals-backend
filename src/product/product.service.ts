/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../stock-reservation/stock-reservation.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { VariantWithAttributesDto } from './dto/create-product-with-attribute.dto';
import { CategoryProductsQueryDto } from './dto/category-products.dto';
import {
  PaginationQueryDto,
  PaginatedResponse,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';

@Injectable()
export class ProductService {
  constructor(
    private prisma: PrismaService,
    private stockReservationService: StockReservationService,
  ) {}

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
        isDeleted: false,
        slug: dto.slug,
        variants: dto.variants
          ? {
              create: dto.variants.map((v: VariantWithAttributesDto) => ({
                sku:
                  v.sku ??
                  `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                price: v.price,
                stock: v.stock,
                isActive: v.isActive ?? true,
                isDeleted: false,
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

  async findAll(
    pagination: PaginationQueryDto,
  ): Promise<PaginatedResponse<any>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    // Fetch products with minimal data - variants just for price/stock calculation
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isDeleted: false,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          variants: {
            where: { isDeleted: false },
            select: {
              id: true,
              price: true,
              stock: true,
            },
          },
          images: {
            where: { type: 'PRODUCT' },
            select: {
              url: true,
              position: true,
            },
            orderBy: { position: 'asc' },
            take: 1, // Only get first image as thumbnail
          },
        },
      }),
      this.prisma.product.count({
        where: { isDeleted: false },
      }),
    ]);

    // Calculate available stock for each product considering reservations
    const lightweightProducts = await Promise.all(
      products.map(async (product) => {
        const prices = product.variants.map((v) => Number(v.price));

        // Calculate available stock considering reservations
        let totalAvailableStock = 0;
        for (const variant of product.variants) {
          try {
            const available =
              await this.stockReservationService.getAvailableStock(variant.id);
            totalAvailableStock += available.data.availableStock;
          } catch {
            // If error, use raw stock
            totalAvailableStock += variant.stock;
          }
        }

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          isActive: product.isActive,
          createdAt: product.createdAt,
          category: product.category,
          thumbnail: product.images[0]?.url || null,
          minPrice: prices.length > 0 ? Math.min(...prices) : 0,
          maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
          totalStock: product.variants.reduce((sum, v) => sum + v.stock, 0),
          availableStock: totalAvailableStock,
          hasVariants: product.variants.length > 0,
        };
      }),
    );

    return createPaginatedResponse(
      lightweightProducts,
      total,
      page,
      limit,
      lightweightProducts.length > 0 ? 'Products found' : 'No products found',
    );
  }

  /**
   * Find products by category slug - lightweight version
   */
  async findByCategory(
    slug: string,
    query: CategoryProductsQueryDto,
  ): Promise<PaginatedResponse<any>> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Find the category by slug (including parent categories)
    const category = await this.prisma.category.findFirst({
      where: {
        OR: [{ slug }, { children: { some: { slug } } }],
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    // If category is not found directly, check if it's a child category
    let actualCategory = category;
    if (!category) {
      const childCategory = await this.prisma.category.findFirst({
        where: { slug },
        select: { id: true, name: true, slug: true },
      });
      actualCategory = childCategory;
    }

    if (!actualCategory) {
      throw new NotFoundException(`Category not found: ${slug}`);
    }

    // Build where clause for category products
    const whereClause: any = {
      isDeleted: false,
      OR: [
        { categoryId: actualCategory.id },
        { category: { parentId: actualCategory.id } },
      ],
    };

    // Fetch products with minimal data - same as findAll
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          variants: {
            where: { isDeleted: false },
            select: {
              id: true,
              price: true,
              stock: true,
            },
          },
          images: {
            where: { type: 'PRODUCT' },
            select: {
              url: true,
              position: true,
            },
            orderBy: { position: 'asc' },
            take: 1,
          },
        },
      }),
      this.prisma.product.count({ where: whereClause }),
    ]);

    // Calculate available stock for each product considering reservations
    const lightweightProducts = await Promise.all(
      products.map(async (product) => {
        const prices = product.variants.map((v) => Number(v.price));

        // Calculate available stock considering reservations
        let totalAvailableStock = 0;
        for (const variant of product.variants) {
          try {
            const available =
              await this.stockReservationService.getAvailableStock(variant.id);
            totalAvailableStock += available.data.availableStock;
          } catch {
            // If error, use raw stock
            totalAvailableStock += variant.stock;
          }
        }

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          isActive: product.isActive,
          createdAt: product.createdAt,
          category: product.category,
          thumbnail: product.images[0]?.url || null,
          minPrice: prices.length > 0 ? Math.min(...prices) : 0,
          maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
          totalStock: product.variants.reduce((sum, v) => sum + v.stock, 0),
          availableStock: totalAvailableStock,
          hasVariants: product.variants.length > 0,
        };
      }),
    );

    return createPaginatedResponse(
      lightweightProducts,
      total,
      page,
      limit,
      lightweightProducts.length > 0 ? 'Products found' : 'No products found',
    );
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        variants: {
          where: { isDeleted: false },
          select: {
            id: true,
            sku: true,
            price: true,
            stock: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            attributes: {
              select: {
                attributeValue: {
                  select: {
                    id: true,
                    value: true,
                    attribute: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
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
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Calculate available stock for each variant considering active reservations
    const variantsWithAvailableStock = await Promise.all(
      product.variants.map(async (variant) => {
        const availableStock =
          await this.stockReservationService.getAvailableStock(variant.id);
        return {
          ...variant,
          availableStock: availableStock.data.availableStock,
          reservedStock: availableStock.data.reservedStock,
        };
      }),
    );

    return {
      message: 'Product found',
      status: 'success',
      data: {
        ...product,
        variants: variantsWithAvailableStock,
      },
    };
  }

  async update(id: number, dto: UpdateProductDto) {
    // First verify product exists
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    const { categoryId, variants, images, ...rest } = dto;

    // Use transaction to handle all variant operations atomically
    const product = await this.prisma.$transaction(async (tx) => {
      // Get existing variants (not deleted)
      const existingVariants = await tx.productVariant.findMany({
        where: { productId: id, isDeleted: false },
        select: { id: true },
      });

      // Process variants if provided
      if (variants && variants.length > 0) {
        // Separate variants with id (update) vs without id (create new)
        const variantsToUpdate = variants.filter((v) => v.id);
        const variantsToCreate = variants.filter((v) => !v.id);

        // Get IDs from the request
        const requestedVariantIds = variantsToUpdate.map((v) => v.id);
        const existingVariantIds = existingVariants.map((v) => v.id);

        // Soft-delete variants NOT in the request
        const variantsToDelete = existingVariantIds.filter(
          (vid) => !requestedVariantIds.includes(vid),
        );

        if (variantsToDelete.length > 0) {
          await tx.productVariant.updateMany({
            where: { id: { in: variantsToDelete } },
            data: { isDeleted: true, deletedAt: new Date() },
          });
        }

        // Update existing variants (only mutable fields: price, stock, sku, isActive, isDeleted)
        for (const variantUpdate of variantsToUpdate) {
          const updateData: Record<string, unknown> = {};
          if (variantUpdate.price !== undefined) {
            updateData.price = variantUpdate.price;
          }
          if (variantUpdate.stock !== undefined) {
            updateData.stock = variantUpdate.stock;
          }
          if (variantUpdate.sku !== undefined) {
            updateData.sku = variantUpdate.sku;
          }
          if (variantUpdate.isActive !== undefined) {
            updateData.isActive = variantUpdate.isActive;
          }
          if (variantUpdate.isDeleted !== undefined) {
            updateData.isDeleted = variantUpdate.isDeleted;
            updateData.deletedAt = variantUpdate.isDeleted ? new Date() : null;
          }

          await tx.productVariant.update({
            where: { id: variantUpdate.id },
            data: updateData,
          });
        }

        // Create new variants (without id = new variant)
        // For new variants, price and stock are required
        if (variantsToCreate.length > 0) {
          for (const newVariant of variantsToCreate) {
            if (
              newVariant.price === undefined ||
              newVariant.stock === undefined
            ) {
              throw new BadRequestException(
                'New variants must have price and stock defined',
              );
            }

            await tx.productVariant.create({
              data: {
                productId: id,
                sku:
                  newVariant.sku ||
                  `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                price: newVariant.price,
                stock: newVariant.stock,
                isActive: newVariant.isActive ?? true,
                isDeleted: false,
              },
            });
          }
        }
      } else if (variants !== undefined) {
        // variants array provided but empty - soft delete ALL existing variants
        const allVariantIds = existingVariants.map((v) => v.id);
        if (allVariantIds.length > 0) {
          await tx.productVariant.updateMany({
            where: { id: { in: allVariantIds } },
            data: { isDeleted: true, deletedAt: new Date() },
          });
        }
      }

      // Update product main fields
      return tx.product.update({
        where: { id },
        data: {
          ...rest,
          ...(categoryId && {
            category: {
              connect: { id: categoryId },
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
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          variants: {
            where: { isDeleted: false },
            select: {
              id: true,
              sku: true,
              price: true,
              stock: true,
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
          },
        },
      });
    });

    return {
      message: 'Product updated successfully',
      data: product,
    };
  }

  async remove(id: number) {
    // Soft delete the product
    await this.prisma.product.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
    return {
      message: 'Product deleted successfully',
      status: 'success',
      data: null,
    };
  }

  // Toggle product active status
  async toggleProductActive(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) throw new NotFoundException('Product not found');

    const updated = await this.prisma.product.update({
      where: { id },
      data: { isActive: !product.isActive },
    });

    return {
      message: `Product ${updated.isActive ? 'activated' : 'deactivated'} successfully`,
      status: 'success',
      data: updated,
    };
  }

  // Toggle variant active status
  async toggleVariantActive(productId: number, variantId: number) {
    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Variant not found');
    }

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { isActive: !variant.isActive },
    });

    return {
      message: `Variant ${updated.isActive ? 'activated' : 'deactivated'} successfully`,
      status: 'success',
      data: updated,
    };
  }

  // Soft delete a variant
  async removeVariant(productId: number, variantId: number) {
    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Variant not found');
    }

    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return {
      message: 'Variant deleted successfully',
      status: 'success',
      data: null,
    };
  }
}
