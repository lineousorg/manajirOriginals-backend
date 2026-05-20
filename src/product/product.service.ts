/* eslint-disable @typescript-eslint/no-unsafe-argument */

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
import { FileService } from '../common/services/file.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
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
    private fileService: FileService,
    private cloudinaryService: CloudinaryService,
  ) {}

  private async validateVariantAttributePayload(
    variants: Array<{
      attributes?: Array<{ attributeId: number; valueId: number }>;
    }>,
  ): Promise<void> {
    // NEW: Check if variants array is empty
    if (!variants || variants.length === 0) {
      throw new BadRequestException('Product must have at least one variant');
    }

    // Check if any variant has no attributes
    // for (const variant of variants) {
    //   if (!variant.attributes || variant.attributes.length === 0) {
    //     throw new BadRequestException(
    //       'Each variant must have at least one attribute',
    //     );
    //   }
    // }

    // Existing validation logic...
    const attributePairs = variants.flatMap(
      (variant) => variant.attributes ?? [],
    );

    const valueIds = [...new Set(attributePairs.map((attr) => attr.valueId))];
    const attributeValues = await this.prisma.attributeValue.findMany({
      where: { id: { in: valueIds } },
      select: { id: true, attributeId: true },
    });
    const attributeValueMap = new Map(
      attributeValues.map((value) => [value.id, value.attributeId]),
    );

    if (attributeValues.length !== valueIds.length) {
      const missingIds = valueIds.filter((id) => !attributeValueMap.has(id));
      throw new BadRequestException(
        `Invalid attribute value IDs: ${missingIds.join(', ')}`,
      );
    }

    for (const variant of variants) {
      if (!variant.attributes || variant.attributes.length === 0) {
        continue; // This shouldn't happen due to check above, but keeping for safety
      }

      const seenAttributeIds = new Set<number>();
      const seenValueIds = new Set<number>();

      for (const attribute of variant.attributes) {
        if (seenAttributeIds.has(attribute.attributeId)) {
          throw new BadRequestException(
            `Duplicate attribute ${attribute.attributeId} provided for a variant`,
          );
        }
        if (seenValueIds.has(attribute.valueId)) {
          throw new BadRequestException(
            `Duplicate attribute value ${attribute.valueId} provided for a variant`,
          );
        }

        seenAttributeIds.add(attribute.attributeId);
        seenValueIds.add(attribute.valueId);

        const actualAttributeId = attributeValueMap.get(attribute.valueId);
        if (actualAttributeId !== attribute.attributeId) {
          throw new BadRequestException(
            `Attribute value ${attribute.valueId} does not belong to attribute ${attribute.attributeId}`,
          );
        }
      }
    }
  }

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
    // Check if slug already exists (ignore soft-deleted products — they are not restorable)
    const existingProduct = await this.prisma.product.findFirst({
      where: { slug: dto.slug, isDeleted: false },
    });

    if (existingProduct) {
      if (!existingProduct.isActive) {
        throw new ConflictException('This slug exists for an inactive product');
      }
      throw new ConflictException('Product with this slug already exists');
    }

    // Handle undefined variants case
    if (!dto.variants) {
      throw new BadRequestException('Product must have at least one variant');
    }

    await this.validateVariantAttributePayload(dto.variants);

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        images: dto.images
          ? {
              create: dto.images.map((img, index) => ({
                url: img.url,
                publicId: img.publicId ?? null,
                altText: img.altText ?? null,
                position: img.position ?? index,
                type: 'PRODUCT',
              })),
            }
          : undefined,
        description: dto.description,
        productDetailsHtml: dto.productDetailsHtml ?? null,
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
    const { page = 1, limit = 10, includeStock = true, search } = pagination;
    const skip = (page - 1) * limit;

    // Build where clause with search capability
    const whereClause: any = {
      isDeleted: false,
      isActive: true,
    };

    // Add search condition if search term is provided
    if (search) {
      whereClause.name = {
        contains: search,
        mode: 'insensitive', // Case-insensitive partial match
      };
    }

    // Fetch products with minimal data
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
        where: whereClause,
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
      // Calculate available stock using pre-fetched data
      let totalAvailableStock = 0;
      let totalReservedStock = 0;
      for (const variant of product.variants) {
        const stockData = stockMap.get(variant.id);
        totalAvailableStock += stockData?.availableStock ?? variant.stock;
        totalReservedStock += stockData?.activeReservationQuantity ?? 0;
      }

      // Build unified pricing information using the single source of truth
      const pricingInfo = this.pricingService.buildProductPricing(product);

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        isActive: product.isActive,
        createdAt: product.createdAt,
        category: product.category,
        thumbnail: product.images[0]?.url || null,
        totalStock: product.variants.reduce((sum, v) => sum + v.stock, 0),
        availableStock: totalAvailableStock,
        reservedStock: totalReservedStock,
        hasVariants: product.variants.length > 0,
        pricing: {
          minPrice: pricingInfo.minPrice,
          maxPrice: pricingInfo.maxPrice,
          finalMinPrice: pricingInfo.finalMinPrice,
          finalMaxPrice: pricingInfo.finalMaxPrice,
          hasDiscount: pricingInfo.hasDiscount,
          discount: pricingInfo.discount,
        },
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
      // Calculate available stock using pre-fetched data
      let totalAvailableStock = 0;
      let totalReservedStock = 0;
      for (const variant of product.variants) {
        const stockData = stockMap.get(variant.id);
        totalAvailableStock += stockData?.availableStock ?? variant.stock;
        totalReservedStock += stockData?.activeReservationQuantity ?? 0;
      }

      // Build unified pricing information using the single source of truth
      const pricingInfo = this.pricingService.buildProductPricing(product);

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        isActive: product.isActive,
        createdAt: product.createdAt,
        category: product.category,
        thumbnail: product.images[0]?.url || null,
        totalStock: product.variants.reduce((sum, v) => sum + v.stock, 0),
        availableStock: totalAvailableStock,
        reservedStock: totalReservedStock,
        hasVariants: product.variants.length > 0,
        pricing: {
          minPrice: pricingInfo.minPrice,
          maxPrice: pricingInfo.maxPrice,
          finalMinPrice: pricingInfo.finalMinPrice,
          finalMaxPrice: pricingInfo.finalMaxPrice,
          hasDiscount: pricingInfo.hasDiscount,
          discount: pricingInfo.discount,
        },
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
        productDetailsHtml: true,
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

    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    // Only validate variants if explicitly provided in update request
    if (variants !== undefined) {
      await this.validateVariantAttributePayload(variants);
    }

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
          productDetailsHtml: true,
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

    // Run the aggregate update in a single transaction so partial writes do not persist
    const updateData: any = { ...rest };
    if (categoryId) {
      updateData.category = { connect: { id: categoryId } };
    }

    const product = await this.prisma.$transaction(async (tx) => {
      if (images && images.length > 0) {
        const imagesToUpdate = images.filter((img) => img.id);
        const imagesToCreate = images.filter((img) => !img.id);

        for (const img of imagesToUpdate) {
          await tx.image.update({
            where: { id: img.id },
            data: {
              url: img.url,
              publicId: img.publicId ?? null,
              altText: img.altText ?? null,
              position: img.position ?? 0,
            },
          });
        }

        if (imagesToCreate.length > 0) {
          await tx.image.createMany({
            data: imagesToCreate.map((img, index) => ({
              productId: id,
              url: img.url,
              publicId: img.publicId ?? null,
              altText: img.altText ?? null,
              position: img.position ?? index,
              type: 'PRODUCT',
            })),
          });
        }
      }

      if (variants && variants.length > 0) {
        const existingVariants = await tx.productVariant.findMany({
          where: { productId: id, isDeleted: false },
          select: { id: true, sku: true },
        });

        const existingVariantMap = new Map(
          existingVariants.map((v) => [v.sku, v.id]),
        );
        const variantsToUpdate = variants.filter((v) => v.id);
        const variantsToUpsert = variants.filter((v) => !v.id);

        for (const variant of variantsToUpdate) {
          if (!variant.id) {
            continue;
          }

          if (
            !existingVariants.some((existing) => existing.id === variant.id)
          ) {
            throw new NotFoundException(
              `Variant ${variant.id} not found for product ${id}`,
            );
          }

          if (variant.attributes && variant.attributes.length > 0) {
            throw new BadRequestException(
              `Updating attributes for existing variant ${variant.id} is not supported in this endpoint`,
            );
          }

          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              ...(variant.price !== undefined && {
                price: variant.price,
              }),
              ...(variant.stock !== undefined && {
                stock: variant.stock,
              }),
              ...(variant.sku !== undefined && { sku: variant.sku }),
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
        }

        for (const variant of variantsToUpsert) {
          if (!(variant.sku && variant.price !== undefined)) {
            continue;
          }

          const existingId = existingVariantMap.get(variant.sku);
          if (existingId) {
            await tx.productVariant.update({
              where: { id: existingId },
              data: {
                price: variant.price,
                stock: variant.stock ?? 0,
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
            const hasAttributes =
              variant.attributes && variant.attributes.length > 0;
            await tx.productVariant.create({
              data: {
                productId: id,
                sku: variant.sku,
                price: variant.price,
                stock: variant.stock ?? 0,
                isActive: true,
                isDeleted: false,
                discountType: variant.discountType ?? null,
                discountValue: variant.discountValue ?? null,
                discountStart: variant.discountStart
                  ? new Date(variant.discountStart)
                  : null,
                discountEnd: variant.discountEnd
                  ? new Date(variant.discountEnd)
                  : null,
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
      }

      return tx.product.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          productDetailsHtml: true,
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

  // Delete a product image
  async deleteImage(productId: number, imageId: number) {
    // 1. Find the image and verify it belongs to the product
    const image = await this.prisma.image.findFirst({
      where: { id: imageId, productId },
    });

    if (!image) {
      throw new NotFoundException(
        'Image not found or does not belong to this product',
      );
    }

    // 2. Delete the file from filesystem
    const filePath = image.url; // e.g., /public/uploads/products/filename.jpg
    await this.fileService.deleteFile(filePath);

    // 3. Delete the image from Cloudinary (if publicId exists)
    if (image.publicId) {
      await this.cloudinaryService.delete(image.publicId);
    }

    // 4. Delete the database record
    await this.prisma.image.delete({
      where: { id: imageId },
    });

    return {
      message: 'Image deleted successfully',
      status: 'success',
    };
  }
}
