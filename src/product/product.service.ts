/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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

export interface ProductDiscountInfo {
  discountId: number;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  discountAmount: number;
  discountedPrice: number;
}

@Injectable()
export class ProductService {
  constructor(
    private prisma: PrismaService,
    private stockReservationService: StockReservationService,
  ) {}

  /**
   * Get active discount info for a product or category
   */
  async getDiscountInfo(
    productId: number,
    categoryId: number,
  ): Promise<ProductDiscountInfo | null> {
    const now = new Date();

    // First, check for variant-specific discounts
    const variantDiscount = await this.prisma.discount.findFirst({
      where: {
        isActive: true,
        target: 'SPECIFIC_VARIANTS',
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        discountVariants: {
          some: {
            variant: {
              productId: productId,
            },
          },
        },
      },
      orderBy: { value: 'desc' },
    });

    if (variantDiscount) {
      return this.calculateDiscountInfo(variantDiscount, 0);
    }

    // Then check for category-specific discounts
    const categoryDiscount = await this.prisma.discount.findFirst({
      where: {
        isActive: true,
        target: 'SPECIFIC_CATEGORY',
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        category: { id: categoryId },
      },
      orderBy: { value: 'desc' },
    });

    if (categoryDiscount) {
      return this.calculateDiscountInfo(categoryDiscount, 0);
    }

    // Finally check for global discounts (ALL_PRODUCTS)
    const globalDiscount = await this.prisma.discount.findFirst({
      where: {
        isActive: true,
        target: 'ALL_PRODUCTS',
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { value: 'desc' },
    });

    if (globalDiscount) {
      return this.calculateDiscountInfo(globalDiscount, 0);
    }

    return null;
  }

  /**
   * Calculate discount info for a given price
   */
  private calculateDiscountInfo(
    discount: any,
    price: number,
  ): ProductDiscountInfo {
    let discountAmount = 0;
    let discountedPrice = price;

    if (discount.type === 'PERCENTAGE') {
      discountAmount = (price * Number(discount.value)) / 100;
      if (discount.maxDiscountAmt) {
        discountAmount = Math.min(
          discountAmount,
          Number(discount.maxDiscountAmt),
        );
      }
    } else {
      discountAmount = Number(discount.value);
    }

    discountedPrice = Math.max(0, price - discountAmount);

    return {
      discountId: discount.id,
      type: discount.type,
      value: Number(discount.value),
      discountAmount,
      discountedPrice,
    };
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
          categoryId: true,
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

    if (products.length === 0) {
      return createPaginatedResponse(
        [],
        total,
        page,
        limit,
        'No products found',
      );
    }

    // Collect all variant IDs and category IDs for batch queries
    const variantIds = [
      ...new Set(products.flatMap((p) => p.variants.map((v) => v.id))),
    ];
    const categoryIds = [...new Set(products.map((p) => p.categoryId))];
    const productIds = products.map((p) => p.id);
    const now = new Date();

    // Batch fetch: active reservations for all variants and discounts
    const [reservations, globalDiscounts, categoryDiscounts, variantDiscounts] =
      await Promise.all([
        this.prisma.stockReservation.groupBy({
          by: ['variantId'],
          where: {
            variantId: { in: variantIds },
            status: 'ACTIVE',
            expiresAt: { gt: now },
          },
          _sum: { quantity: true },
        }),
        // Global discounts (all products)
        this.prisma.discount.findMany({
          where: {
            isActive: true,
            target: 'ALL_PRODUCTS',
            startsAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { id: true, type: true, value: true, target: true },
        }) as Promise<any[]>,
        // Category-specific discounts
        this.prisma.discount.findMany({
          where: {
            isActive: true,
            target: 'SPECIFIC_CATEGORY',
            startsAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            category: { id: { in: categoryIds } },
          },
          include: { category: { select: { id: true } } },
        }) as Promise<any[]>,
        // Variant-specific discounts
        this.prisma.discount.findMany({
          where: {
            isActive: true,
            target: 'SPECIFIC_VARIANTS',
            startsAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            discountVariants: { some: { variantId: { in: variantIds } } },
          },
          include: { discountVariants: { select: { variantId: true } } },
        }) as Promise<any[]>,
      ]);

    // Build lookup maps for O(1) access
    const reservationMap = new Map<number, number>();
    for (const r of reservations) {
      reservationMap.set(r.variantId, r._sum.quantity || 0);
    }

    const discountMap = new Map<string, ProductDiscountInfo>();

    // Process global discounts (apply to all products)
    for (const d of globalDiscounts) {
      const discountInfo: ProductDiscountInfo = {
        discountId: d.id,
        type: d.type as 'PERCENTAGE' | 'FIXED',
        value: Number(d.value),
        discountAmount: 0,
        discountedPrice: 0,
      };
      for (const pid of productIds) {
        discountMap.set(`product:${pid}`, discountInfo);
      }
    }

    // Process category-specific discounts
    for (const d of categoryDiscounts) {
      const discountInfo: ProductDiscountInfo = {
        discountId: d.id,
        type: d.type as 'PERCENTAGE' | 'FIXED',
        value: Number(d.value),
        discountAmount: 0,
        discountedPrice: 0,
      };
      const discountCategoryId = d.category?.id;
      if (discountCategoryId) {
        const matchingProducts = products
          .filter((p) => p.categoryId === discountCategoryId)
          .map((p) => p.id);
        for (const pid of matchingProducts) {
          discountMap.set(`product:${pid}`, discountInfo);
        }
      }
    }

    // Process variant-specific discounts
    for (const d of variantDiscounts) {
      const discountInfo: ProductDiscountInfo = {
        discountId: d.id,
        type: d.type as 'PERCENTAGE' | 'FIXED',
        value: Number(d.value),
        discountAmount: 0,
        discountedPrice: 0,
      };
      const variantIdsSet = new Set(
        d.discountVariants?.map((dv: any) => dv.variantId) || [],
      );
      for (const p of products) {
        const pVariantIds = p.variants.map((v) => v.id);
        const hasMatch = pVariantIds.some((vid) => variantIdsSet.has(vid));
        if (hasMatch) {
          discountMap.set(`product:${p.id}`, discountInfo);
        }
      }
    }

    // Process products - now using O(1) lookups
    const lightweightProducts = products.map((product) => {
      const prices = product.variants.map((v) => Number(v.price));

      // Calculate available stock from batch results
      let totalAvailableStock = 0;
      for (const variant of product.variants) {
        const reserved = reservationMap.get(variant.id) || 0;
        totalAvailableStock += Math.max(0, variant.stock - reserved);
      }

      // Get discount from map
      const discountInfo = discountMap.get(`product:${product.id}`) || null;

      // Calculate discounted price range
      let minDiscountedPrice: number | null = null;
      let maxDiscountedPrice: number | null = null;
      if (discountInfo && prices.length > 0) {
        const discountedPrices = prices.map(
          (p) =>
            p -
            (discountInfo.type === 'PERCENTAGE'
              ? Math.min(p * (discountInfo.value / 100), discountInfo.value)
              : discountInfo.value),
        );
        minDiscountedPrice = Math.min(...discountedPrices);
        maxDiscountedPrice = Math.max(...discountedPrices);
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
        minDiscountedPrice,
        maxDiscountedPrice,
        discount: discountInfo,
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
          categoryId: true,
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

        // Get discount info for this product
        const discountInfo = await this.getDiscountInfo(
          product.id,
          product.categoryId,
        );

        // Calculate discounted price range if discount exists
        let minDiscountedPrice: number | null = null;
        let maxDiscountedPrice: number | null = null;
        if (discountInfo && prices.length > 0) {
          const discountedPrices = prices.map(
            (p) =>
              p -
              (discountInfo.type === 'PERCENTAGE'
                ? Math.min(
                    (p * discountInfo.value) / 100,
                    Number(discountInfo.value),
                  )
                : discountInfo.value),
          );
          minDiscountedPrice = Math.min(...discountedPrices);
          maxDiscountedPrice = Math.max(...discountedPrices);
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
          minDiscountedPrice,
          maxDiscountedPrice,
          discount: discountInfo,
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

    // Get discount info for this product
    const discountInfo = await this.getDiscountInfo(
      product.id,
      product.categoryId,
    );

    // Calculate available stock for each variant considering active reservations
    const variantsWithAvailableStock = await Promise.all(
      product.variants.map(async (variant) => {
        const availableStock =
          await this.stockReservationService.getAvailableStock(variant.id);

        // Calculate discounted price if discount exists
        let discountedPrice: number | null = null;
        if (discountInfo) {
          const price = Number(variant.price);
          if (discountInfo.type === 'PERCENTAGE') {
            const discountAmt = Math.min(
              (price * discountInfo.value) / 100,
              Number(discountInfo.value),
            );
            discountedPrice = price - discountAmt;
          } else {
            discountedPrice = Math.max(0, price - discountInfo.value);
          }
        }

        return {
          ...variant,
          price: Number(variant.price),
          discountedPrice,
          availableStock: availableStock.data.availableStock,
          reservedStock: availableStock.data.reservedStock,
        };
      }),
    );

    // Calculate price range with discounts
    const prices = variantsWithAvailableStock.map((v) => v.price);
    let minDiscountedPrice: number | null = null;
    let maxDiscountedPrice: number | null = null;
    if (discountInfo && prices.length > 0) {
      const discountedPrices = prices.map(
        (p) =>
          p -
          (discountInfo.type === 'PERCENTAGE'
            ? Math.min(
                (p * discountInfo.value) / 100,
                Number(discountInfo.value),
              )
            : discountInfo.value),
      );
      minDiscountedPrice = Math.min(...discountedPrices);
      maxDiscountedPrice = Math.max(...discountedPrices);
    }

    return {
      message: 'Product found',
      status: 'success',
      data: {
        ...product,
        minPrice: prices.length > 0 ? Math.min(...prices) : 0,
        maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
        minDiscountedPrice,
        maxDiscountedPrice,
        discount: discountInfo,
        variants: variantsWithAvailableStock,
      },
    };
  }

  async update(id: number, dto: UpdateProductDto) {
    await this.findOne(id);

    const { categoryId, variants, images, ...rest } = dto;

    // Use transaction to handle foreign key constraints
    const product = await this.prisma.$transaction(async (tx) => {
      // Delete variant attributes and variants in bulk if variants are being updated
      if (variants) {
        // Get all variant IDs for this product
        const existingVariants = await tx.productVariant.findMany({
          where: { productId: id },
          select: { id: true },
        });

        // Delete all variant attributes for all variants at once
        if (existingVariants.length > 0) {
          const variantIds = existingVariants.map((v) => v.id);
          await tx.variantAttribute.deleteMany({
            where: { variantId: { in: variantIds } },
          });
        }

        // Delete all variants at once
        await tx.productVariant.deleteMany({
          where: { productId: id },
        });
      }

      // Update product
      return tx.product.update({
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
            select: {
              id: true,
              sku: true,
              price: true,
              stock: true,
              isActive: true,
            },
          },
        },
      });
    });

    return {
      message: 'Product updated successfully',
      status: 'success',
      data: product,
    };
  }

  /**
   * Remove (soft delete) a product
   */
  async remove(id: number) {
    await this.findOne(id);

    // Soft delete - set isDeleted to true
    await this.prisma.product.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // Also soft delete all variants
    await this.prisma.productVariant.updateMany({
      where: { productId: id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return {
      message: 'Product removed successfully',
      status: 'success',
    };
  }

  /**
   * Toggle product active status
   */
  async toggleProductActive(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: { isActive: !product.isActive },
      select: {
        id: true,
        isActive: true,
      },
    });

    return {
      message: `Product ${updatedProduct.isActive ? 'activated' : 'deactivated'} successfully`,
      status: 'success',
      data: updatedProduct,
    };
  }

  /**
   * Toggle variant active status
   */
  async toggleVariantActive(id: number, variantId: number) {
    await this.findOne(id);

    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId: id,
      },
    });

    if (!variant) {
      throw new NotFoundException(
        `Variant with ID ${variantId} not found in product`,
      );
    }

    const updatedVariant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { isActive: !variant.isActive },
      select: {
        id: true,
        isActive: true,
      },
    });

    return {
      message: `Variant ${updatedVariant.isActive ? 'activated' : 'deactivated'} successfully`,
      status: 'success',
      data: updatedVariant,
    };
  }

  /**
   * Remove a variant from a product
   */
  async removeVariant(id: number, variantId: number) {
    await this.findOne(id);

    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId: id,
      },
    });

    if (!variant) {
      throw new NotFoundException(
        `Variant with ID ${variantId} not found in product`,
      );
    }

    // Soft delete the variant
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return {
      message: 'Variant removed successfully',
      status: 'success',
    };
  }

  async delete(id: number) {
    await this.findOne(id);

    // Soft delete - set isDeleted to true
    await this.prisma.product.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // Also soft delete all variants
    await this.prisma.productVariant.updateMany({
      where: { productId: id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return {
      message: 'Product deleted successfully',
      status: 'success',
    };
  }
}
