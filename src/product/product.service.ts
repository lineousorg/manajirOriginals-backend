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
import { CategoryProductsQueryDto } from './dto/category-products.dto';
import {
  PaginationQueryDto,
  PaginatedResponse,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';

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
    const { page = 1, limit = 20 } = pagination;
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

    // Transform data to lightweight format
    const lightweightProducts = products.map((product) => {
      const prices = product.variants.map((v) => Number(v.price));
      const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);

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
        totalStock,
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
   * Find products by category slug with server-side filtering
   */
  async findByCategory(
    slug: string,
    query: CategoryProductsQueryDto,
  ): Promise<{
    category: { id: number; name: string; slug: string } | null;
    products: PaginatedResponse<any>;
    filters: {
      availableSizes: string[];
      availableColors: { name: string; hex: string }[];
      priceRange: { min: number; max: number };
    };
  }> {
    const {
      page = 1,
      limit = 20,
      minPrice,
      minMaxPrice,
      sizes,
      colors,
      sortBy = 'newest',
    } = query;
    const skip = (page - 1) * limit;

    // First, find the category by slug (including parent categories)
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

    // Build the where clause for products
    const whereClause: any = {
      isDeleted: false,
      OR: [
        { categoryId: actualCategory.id },
        { category: { parentId: actualCategory.id } },
      ],
    };

    // Build orderBy
    let orderBy: any = { createdAt: 'desc' };
    switch (sortBy) {
      case 'price-asc':
        orderBy = { variants: { _min: { price: 'asc' } } };
        break;
      case 'price-desc':
        orderBy = { variants: { _max: { price: 'desc' } } };
        break;
      case 'name-asc':
        orderBy = { name: 'asc' };
        break;
      case 'name-desc':
        orderBy = { name: 'desc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    // Get all products in this category (without pagination) to calculate filters
    const allProductsInCategory = await this.prisma.product.findMany({
      where: whereClause,
      select: {
        id: true,
        variants: {
          where: { isDeleted: false },
          select: {
            price: true,
            attributes: {
              include: {
                attributeValue: {
                  include: {
                    attribute: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        images: {
          where: { type: 'PRODUCT' },
          select: { url: true, position: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    // Extract available sizes and colors from all products
    const sizeSet = new Set<string>();
    const colorMap = new Map<string, { name: string; hex: string }>();
    let minPriceFound = Infinity;
    let maxPriceFound = 0;

    for (const product of allProductsInCategory) {
      for (const variant of product.variants) {
        const price = Number(variant.price);
        if (price < minPriceFound) minPriceFound = price;
        if (price > maxPriceFound) maxPriceFound = price;

        for (const attr of variant.attributes) {
          const attrName = attr.attributeValue.attribute.name.toLowerCase();
          if (attrName === 'size') {
            sizeSet.add(attr.attributeValue.value);
          } else if (attrName === 'color') {
            if (!colorMap.has(attr.attributeValue.value)) {
              colorMap.set(attr.attributeValue.value, {
                name: attr.attributeValue.value,
                hex: '#000000', // Default - frontend can override
              });
            }
          }
        }
      }
    }

    // Apply price filter by modifying the where clause
    if (minPrice !== undefined || minMaxPrice !== undefined) {
      whereClause.variants = {
        some: {
          isDeleted: false,
          price: {
            gte: minPrice || 0,
            ...(minMaxPrice && { lte: minMaxPrice }),
          },
        },
      };
    }

    // Apply size and color filters
    if (sizes && sizes.length > 0) {
      whereClause.variants = {
        ...whereClause.variants,
        some: {
          ...(whereClause.variants?.some || {}),
          attributes: {
            some: {
              attributeValue: {
                value: { in: sizes },
                attribute: { name: { equals: 'size', mode: 'insensitive' } },
              },
            },
          },
        },
      };
    }

    if (colors && colors.length > 0) {
      whereClause.variants = {
        ...whereClause.variants,
        some: {
          ...(whereClause.variants?.some || {}),
          attributes: {
            some: {
              attributeValue: {
                value: { in: colors },
                attribute: { name: { equals: 'color', mode: 'insensitive' } },
              },
            },
          },
        },
      };
    }

    // Fetch paginated products
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy,
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
              attributes: {
                include: {
                  attributeValue: {
                    include: {
                      attribute: { select: { name: true } },
                    },
                  },
                },
              },
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

    // Transform products to lightweight format
    const lightweightProducts = products.map((product) => {
      const prices = product.variants.map((v) => Number(v.price));
      const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);

      // Extract sizes and colors for this product
      const productSizes = new Set<string>();
      const productColors = new Set<string>();

      for (const variant of product.variants) {
        for (const attr of variant.attributes) {
          const attrName = attr.attributeValue.attribute.name.toLowerCase();
          if (attrName === 'size') {
            productSizes.add(attr.attributeValue.value);
          } else if (attrName === 'color') {
            productColors.add(attr.attributeValue.value);
          }
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
        totalStock,
        hasVariants: product.variants.length > 0,
        sizes: Array.from(productSizes),
        colors: Array.from(productColors),
      };
    });

    return {
      category: actualCategory,
      products: createPaginatedResponse(
        lightweightProducts,
        total,
        page,
        limit,
        lightweightProducts.length > 0 ? 'Products found' : 'No products found',
      ),
      filters: {
        availableSizes: Array.from(sizeSet).sort(),
        availableColors: Array.from(colorMap.values()),
        priceRange: {
          min: minPriceFound === Infinity ? 0 : Math.floor(minPriceFound),
          max: maxPriceFound === 0 ? 10000 : Math.ceil(maxPriceFound),
        },
      },
    };
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
