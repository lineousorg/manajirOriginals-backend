/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ConflictException,
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
                // Discount fields
                discountType: v.discountType ?? null,
                discountValue: v.discountValue ?? null,
                discountStart: v.discountStart
                  ? new Date(v.discountStart)
                  : null,
                discountEnd: v.discountEnd ? new Date(v.discountEnd) : null,
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
      data: {
        ...product,
        categoryId: product.categoryId,
      },
    };
  }

  async findAll(
    pagination: PaginationQueryDto,
  ): Promise<PaginatedResponse<any>> {
    const { page = 1, limit = 10, includeStock = true } = pagination;
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
              // Discount fields
              discountType: true,
              discountValue: true,
              discountStart: true,
              discountEnd: true,
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

    // Build stock map only if includeStock is true (skip unnecessary DB query for better performance)
    let stockMap = new Map();
    if (includeStock && products.length > 0) {
      const allVariantIds = products.flatMap((p) =>
        p.variants.map((v) => v.id),
      );
      const stockInfo =
        await this.stockReservationService.getAvailableStockBulk(allVariantIds);
      stockMap = new Map(stockInfo.map((s) => [s.variantId, s]));
    }

    const lightweightProducts = products.map((product) => {
      const now = new Date();

      // Calculate prices with discount for each variant
      let minPrice = 0;
      let maxPrice = 0;
      let hasDiscount = false;
      let discountAmount = 0;
      let discountPercentage = 0;

      if (product.variants.length > 0) {
        const finalPrices: number[] = [];

        for (const variant of product.variants) {
          const basePrice = Number(variant.price);
          let finalPrice = basePrice;
          let variantHasDiscount = false;
          let variantDiscountAmount = 0;

          // Check if discount is active
          const isDiscountActive =
            variant.discountType &&
            variant.discountValue &&
            (!variant.discountStart ||
              now >= new Date(variant.discountStart)) &&
            (!variant.discountEnd || now <= new Date(variant.discountEnd));

          if (isDiscountActive) {
            variantHasDiscount = true;
            const discountValue = Number(variant.discountValue);

            if (variant.discountType === 'PERCENTAGE') {
              variantDiscountAmount = (basePrice * discountValue) / 100;
            } else if (variant.discountType === 'FIXED') {
              variantDiscountAmount = discountValue;
            }

            finalPrice = Math.max(0, basePrice - variantDiscountAmount);
          }

          if (variantHasDiscount) {
            hasDiscount = true;
            discountAmount = variantDiscountAmount;
            if (variant.discountType === 'PERCENTAGE') {
              discountPercentage = Number(variant.discountValue);
            }
          }

          finalPrices.push(finalPrice);
        }

        minPrice = Math.min(...finalPrices);
        maxPrice = Math.max(...finalPrices);
      }

      // Calculate available stock using pre-fetched data
      let totalAvailableStock = 0;
      let totalReservedStock = 0;
      for (const variant of product.variants) {
        const stockData = stockMap.get(variant.id);
        totalAvailableStock += stockData?.availableStock ?? variant.stock;
        totalReservedStock += stockData?.activeReservationQuantity ?? 0;
      }

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        isActive: product.isActive,
        createdAt: product.createdAt,
        category: product.category,
        thumbnail: product.images[0]?.url || null,
        minPrice,
        maxPrice,
        totalStock: product.variants.reduce((sum, v) => sum + v.stock, 0),
        availableStock: totalAvailableStock,
        reservedStock: totalReservedStock,
        hasVariants: product.variants.length > 0,
        hasDiscount,
        discountAmount,
        discountPercentage,
      };
    });

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

    // Calculate available stock for each product considering reservations (optimized - single bulk query)
    const allVariantIds = products.flatMap((p) => p.variants.map((v) => v.id));
    const stockInfo =
      allVariantIds.length > 0
        ? await this.stockReservationService.getAvailableStockBulk(
            allVariantIds,
          )
        : [];
    const stockMap = new Map(stockInfo.map((s) => [s.variantId, s]));

    const lightweightProducts = products.map((product) => {
      const prices = product.variants.map((v) => Number(v.price));

      // Calculate available stock using pre-fetched data
      let totalAvailableStock = 0;
      for (const variant of product.variants) {
        const stockData = stockMap.get(variant.id);
        totalAvailableStock += stockData?.availableStock ?? variant.stock;
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
    });

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
        categoryId: true,
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
            // Discount fields
            discountType: true,
            discountValue: true,
            discountStart: true,
            discountEnd: true,
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

    // Calculate available stock for each variant considering active reservations (optimized - single bulk query)
    const allVariantIds = product.variants.map((v) => v.id);
    const stockInfo =
      await this.stockReservationService.getAvailableStockBulk(allVariantIds);
    const stockMap = new Map(stockInfo.map((s) => [s.variantId, s]));

    // Add stock info to each variant
    const variantsWithAvailableStock = product.variants.map((variant) => {
      const stockData = stockMap.get(variant.id);
      return {
        ...variant,
        availableStock: stockData?.availableStock ?? variant.stock,
        reservedStock: stockData?.activeReservationQuantity ?? 0,
      };
    });

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
    const { categoryId, variants, images, ...rest } = dto;

    // Determine if we need a transaction (only for images/variants changes)
    const needsTransaction =
      (variants && variants.length > 0) || (images && images.length > 0);

    // If no transaction needed, do a simple update
    if (!needsTransaction) {
      const updateData: any = { ...rest };
      if (categoryId) {
        updateData.category = { connect: { id: categoryId } };
      }

      const updatedProduct = await this.prisma.product.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          categoryId: true,
          category: {
            select: { id: true, name: true, slug: true },
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
            select: { id: true, url: true, altText: true, position: true },
          },
        },
      });

      return { message: 'Product updated successfully', data: updatedProduct };
    }

    // Run operations sequentially (no transaction - more reliable)
    // 1. Update basic product fields first
    const updateData: any = { ...rest };
    if (categoryId) {
      updateData.category = { connect: { id: categoryId } };
    }

    // 2. Handle images - update existing or add new ones
    if (images && images.length > 0) {
      const imagesToUpdate = images.filter((img) => img.id);
      const imagesToCreate = images.filter((img) => !img.id);

      // Update all images in parallel
      if (imagesToUpdate.length > 0) {
        await Promise.all(
          imagesToUpdate.map((img) =>
            this.prisma.image.update({
              where: { id: img.id },
              data: {
                url: img.url,
                altText: img.altText ?? null,
                position: img.position ?? 0,
              },
            }),
          ),
        );
      }

      // Create new images
      if (imagesToCreate.length > 0) {
        await this.prisma.image.createMany({
          data: imagesToCreate.map((img, index) => ({
            productId: id,
            url: img.url,
            altText: img.altText ?? null,
            position: img.position ?? index,
            type: 'PRODUCT',
          })),
        });
      }
    }

    // 3. Handle variants - optimized with parallel queries
    if (variants && variants.length > 0) {
      // Fetch existing variants once
      const existingVariants = await this.prisma.productVariant.findMany({
        where: { productId: id, isDeleted: false },
        select: { id: true, sku: true },
      });

      const existingVariantMap = new Map(
        existingVariants.map((v) => [v.sku, v.id]),
      );

      // Separate variants with IDs (update) and without IDs (upsert by SKU)
      const variantsToUpdate = variants.filter((v) => v.id);
      const variantsToUpsert = variants.filter((v) => !v.id);

      // Update existing variants by ID in parallel
      if (variantsToUpdate.length > 0) {
        await Promise.all(
          variantsToUpdate.map((variant) =>
            variant.id
              ? this.prisma.productVariant.update({
                  where: { id: variant.id },
                  data: {
                    ...(variant.price !== undefined && {
                      price: variant.price,
                    }),
                    ...(variant.stock !== undefined && {
                      stock: variant.stock,
                    }),
                    ...(variant.sku !== undefined && { sku: variant.sku }),
                    // Discount fields
                    ...(variant.discountType !== undefined && {
                      discountType: variant.discountType,
                    }),
                    ...(variant.discountValue !== undefined && {
                      discountValue: variant.discountValue,
                    }),
                    ...(variant.discountStart !== undefined && {
                      discountStart: variant.discountStart
                        ? new Date(variant.discountStart)
                        : null,
                    }),
                    ...(variant.discountEnd !== undefined && {
                      discountEnd: variant.discountEnd
                        ? new Date(variant.discountEnd)
                        : null,
                    }),
                  },
                })
              : Promise.resolve(),
          ),
        );
      }

      // Upsert variants by checking if SKU exists - in parallel
      if (variantsToUpsert.length > 0) {
        const upsertPromises = variantsToUpsert.map((variant) => {
          if (variant.sku && variant.price !== undefined) {
            const existingId = existingVariantMap.get(variant.sku);
            if (existingId) {
              return this.prisma.productVariant.update({
                where: { id: existingId },
                data: {
                  price: variant.price,
                  stock: variant.stock ?? 0,
                  // Discount fields
                  ...(variant.discountType !== undefined && {
                    discountType: variant.discountType,
                  }),
                  ...(variant.discountValue !== undefined && {
                    discountValue: variant.discountValue,
                  }),
                  ...(variant.discountStart !== undefined && {
                    discountStart: variant.discountStart
                      ? new Date(variant.discountStart)
                      : null,
                  }),
                  ...(variant.discountEnd !== undefined && {
                    discountEnd: variant.discountEnd
                      ? new Date(variant.discountEnd)
                      : null,
                  }),
                },
              });
            } else {
              // Create new variant with attributes
              const hasAttributes =
                variant.attributes && variant.attributes.length > 0;
              return this.prisma.productVariant.create({
                data: {
                  productId: id,
                  sku: variant.sku,
                  price: variant.price,
                  stock: variant.stock ?? 0,
                  isActive: true,
                  isDeleted: false,
                  // Discount fields
                  discountType: variant.discountType ?? null,
                  discountValue: variant.discountValue ?? null,
                  discountStart: variant.discountStart
                    ? new Date(variant.discountStart)
                    : null,
                  discountEnd: variant.discountEnd
                    ? new Date(variant.discountEnd)
                    : null,
                  // Connect attributes if provided
                  ...(hasAttributes && {
                    attributes: {
                      create: variant.attributes!.map((attr) => ({
                        attributeValueId: attr.valueId,
                      })),
                    },
                  }),
                },
              });
            }
          }
          return Promise.resolve();
        });

        await Promise.all(upsertPromises);
      }
    }

    // Finally update the product basic fields
    const product = await this.prisma.product.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        categoryId: true,
        category: { select: { id: true, name: true, slug: true } },
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
          select: { id: true, url: true, altText: true, position: true },
        },
      },
    });

    return { message: 'Product updated successfully', data: product };
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
