/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../stock-reservation/stock-reservation.service';
import { PricingService } from '../common/services/pricing.service';
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
    private pricingService: PricingService,
  ) {}

  /**
   * Calculate variant pricing with discount validation
   * Delegates to shared PricingService for consistency
   */
  private calculateVariantPricing(variant: any, now: Date) {
    return this.pricingService.calculateVariantPricing(variant, now);
  }

  /**
   * Get the sort order for size values
   * Returns the index in the size order array, or 999 for unknown sizes
   */
  private getSizeOrder(value: string): number {
    const sizeOrder = ['xs', 's', 'm', 'l', 'xl', '2xl', 'xxl', '3xl'];
    const lowerValue = value.toLowerCase();
    const index = sizeOrder.indexOf(lowerValue);
    return index === -1 ? 999 : index;
  }

  /**
   * Sort variants by size attribute if present
   * Maintains correct order: xs, s, m, l, xl, 2xl, etc.
   */
  private sortVariantsBySize(variants: any[]): any[] {
    return [...variants].sort((a, b) => {
      const sizeA = a.attributes?.find(
        (attr: any) =>
          attr.attributeValue?.attribute?.name?.toLowerCase() === 'size',
      )?.attributeValue?.value;
      const sizeB = b.attributes?.find(
        (attr: any) =>
          attr.attributeValue?.attribute?.name?.toLowerCase() === 'size',
      )?.attributeValue?.value;

      if (sizeA && sizeB) {
        return this.getSizeOrder(sizeA) - this.getSizeOrder(sizeB);
      }
      return 0;
    });
  }

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
    // findAll method
    const { page = 1, limit = 10, includeStock = true } = pagination;
    const skip = (page - 1) * limit;

    // Fetch products with minimal data
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isDeleted: false,
          isActive: true,
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

      // Calculate prices using helper method
      let minPrice = 0;
      let maxPrice = 0;
      let minFinalPrice = 0;
      let hasDiscount = false;

      if (product.variants.length > 0) {
        const basePrices: number[] = [];
        const finalPrices: number[] = [];
        let minBasePrice = Infinity;
        let minBaseVariant: any = null;

        for (const variant of product.variants) {
          const pricing = this.calculateVariantPricing(variant, now);
          basePrices.push(pricing.basePrice);
          finalPrices.push(pricing.finalPrice);

          // Track variant with minimum base price for minFinalPrice
          if (pricing.basePrice < minBasePrice) {
            minBasePrice = pricing.basePrice;
            minBaseVariant = variant;
          }

          if (pricing.hasDiscount) {
            hasDiscount = true;
          }
        }

        minPrice = Math.min(...basePrices);
        maxPrice = Math.max(...basePrices);

        // Find the final price of the variant with minimum base price
        if (minBaseVariant) {
          const minPricing = this.calculateVariantPricing(minBaseVariant, now);
          minFinalPrice = minPricing.finalPrice;
        } else {
          minFinalPrice = minPrice;
        }
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
        discountAmount:
          minFinalPrice > 0 && minFinalPrice < minPrice
            ? minPrice - minFinalPrice
            : 0,
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
    // findByCategory method
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
      const now = new Date();

      // Calculate prices using helper method
      let minPrice = 0;
      let maxPrice = 0;
      let minFinalPrice = 0;
      let hasDiscount = false;

      if (product.variants.length > 0) {
        const basePrices: number[] = [];
        const finalPrices: number[] = [];
        let minBasePrice = Infinity;
        let minBaseVariant: any = null;

        for (const variant of product.variants) {
          const pricing = this.calculateVariantPricing(variant, now);
          basePrices.push(pricing.basePrice);
          finalPrices.push(pricing.finalPrice);

          if (pricing.basePrice < minBasePrice) {
            minBasePrice = pricing.basePrice;
            minBaseVariant = variant;
          }

          if (pricing.hasDiscount) {
            hasDiscount = true;
          }
        }

        minPrice = Math.min(...basePrices);
        maxPrice = Math.max(...basePrices);

        if (minBaseVariant) {
          const minPricing = this.calculateVariantPricing(minBaseVariant, now);
          minFinalPrice = minPricing.finalPrice;
        } else {
          minFinalPrice = minPrice;
        }
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
        minFinalPrice,
        totalStock: product.variants.reduce((sum, v) => sum + v.stock, 0),
        availableStock: totalAvailableStock,
        reservedStock: totalReservedStock,
        hasVariants: product.variants.length > 0,
        hasDiscount,
        discountAmount: 0,
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

    // Add stock and pricing info to each variant
    const now = new Date();
    const variantsWithAvailableStock = product.variants.map((variant) => {
      const stockData = stockMap.get(variant.id);
      const pricing = this.calculateVariantPricing(variant, now);
      return {
        ...variant,
        price: pricing.basePrice,
        finalPrice: pricing.finalPrice,
        hasDiscount: pricing.hasDiscount,
        discountAmount: pricing.discountAmount,
        availableStock: stockData?.availableStock ?? variant.stock,
        reservedStock: stockData?.activeReservationQuantity ?? 0,
      };
    });

    // Sort variants by size if they have size attributes
    const sortedVariants = this.sortVariantsBySize(variantsWithAvailableStock);

    return {
      message: 'Product found',
      status: 'success',
      data: {
        ...product,
        variants: sortedVariants,
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
    // FIX #8: Check if product has variants with active reservations before deletion
    const variants = await this.prisma.productVariant.findMany({
      where: { productId: id, isDeleted: false },
      select: { id: true },
    });

    if (variants.length > 0) {
      const variantIds = variants.map((v) => v.id);

      // Check for active reservations on any variant
      const activeReservations = await this.prisma.stockReservation.count({
        where: {
          variantId: { in: variantIds },
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
      });

      if (activeReservations > 0) {
        throw new BadRequestException(
          `Cannot delete product: ${activeReservations} active reservation(s) found on its variants. ` +
            `Please wait for reservations to expire or release them first.`,
        );
      }
    }

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

    // FIX #9: Check if variant has active reservations before deletion
    const activeReservations = await this.prisma.stockReservation.count({
      where: {
        variantId: variantId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
    });

    if (activeReservations > 0) {
      throw new BadRequestException(
        `Cannot delete variant: ${activeReservations} active reservation(s) found. ` +
          `Please wait for reservations to expire or release them first.`,
      );
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
