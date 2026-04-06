/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaginationQueryDto,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';

export interface DiscountCalculation {
  discountId: number;
  type: 'PERCENTAGE' | 'FIXED';
  value: any;
  appliedAmount: number;
}

@Injectable()
export class DiscountService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new discount
   */
  async create(data: {
    name: string;
    code?: string;
    type: 'PERCENTAGE' | 'FIXED';
    value: number;
    target?: 'ALL_PRODUCTS' | 'SPECIFIC_CATEGORY' | 'SPECIFIC_VARIANTS';
    minOrderAmount?: number;
    maxDiscountAmt?: number;
    isActive?: boolean;
    startsAt?: Date;
    expiresAt?: Date;
    categoryId?: number;
    variantIds?: number[];
    maxUsage?: number;
  }) {
    const discount = await this.prisma.discount.create({
      data: {
        name: data.name,
        code: data.code || null,
        type: data.type,
        value: data.value,
        target: data.target || 'ALL_PRODUCTS',
        minOrderAmount: data.minOrderAmount || null,
        maxDiscountAmt: data.maxDiscountAmt || null,
        isActive: data.isActive ?? true,
        startsAt: data.startsAt || new Date(),
        expiresAt: data.expiresAt || null,
        category: data.categoryId
          ? { connect: { id: data.categoryId } }
          : undefined,
        maxUsage: data.maxUsage ?? null,
        discountVariants: data.variantIds
          ? {
              create: data.variantIds.map((variantId) => ({
                variantId,
              })),
            }
          : undefined,
      },
    });

    return {
      message: 'Discount created successfully',
      status: 'success',
      data: discount,
    };
  }

  /**
   * Get all discounts with pagination
   */
  async findAll(pagination: PaginationQueryDto) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const [discounts, total] = await Promise.all([
      this.prisma.discount.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          discountVariants: {
            select: { variant: { select: { id: true, sku: true } } },
            take: 5,
          },
          _count: {
            select: { orders: true },
          },
        },
      }),
      this.prisma.discount.count(),
    ]);

    return createPaginatedResponse(
      discounts,
      total,
      page,
      limit,
      discounts.length > 0 ? 'Discounts retrieved' : 'No discounts found',
    );
  }

  /**
   * Get a single discount by ID
   */
  async findOne(id: number) {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
      include: {
        category: true,
        discountVariants: {
          include: {
            variant: {
              include: {
                product: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
        orders: {
          select: { id: true, total: true, createdAt: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!discount) {
      throw new NotFoundException(`Discount with ID ${id} not found`);
    }

    return {
      message: 'Discount retrieved',
      status: 'success',
      data: discount,
    };
  }

  /**
   * Update a discount
   */
  async update(
    id: number,
    data: {
      name?: string;
      code?: string;
      type?: 'PERCENTAGE' | 'FIXED';
      value?: number;
      target?: 'ALL_PRODUCTS' | 'SPECIFIC_CATEGORY' | 'SPECIFIC_VARIANTS';
      minOrderAmount?: number;
      maxDiscountAmt?: number;
      isActive?: boolean;
      startsAt?: Date;
      expiresAt?: Date;
      categoryId?: number;
      variantIds?: number[];
      maxUsage?: number;
    },
  ) {
    // Check if discount exists
    await this.findOne(id);

    // Build update data
    const updateData: any = { ...data };

    // Handle variantIds update - use junction table
    if (data.variantIds !== undefined) {
      // First delete existing discount variants
      await this.prisma.discountVariant.deleteMany({
        where: { discountId: id },
      });

      // Then create new discount variants
      if (data.variantIds.length > 0) {
        await this.prisma.discountVariant.createMany({
          data: data.variantIds.map((variantId) => ({
            discountId: id,
            variantId,
          })),
        });
      }
      delete updateData.variantIds;
    }

    // Remove undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const discount = await this.prisma.discount.update({
      where: { id },
      data: updateData,
    });

    return {
      message: 'Discount updated successfully',
      status: 'success',
      data: discount,
    };
  }

  /**
   * Delete a discount
   */
  async delete(id: number) {
    // Check if discount exists
    await this.findOne(id);

    await this.prisma.discount.delete({
      where: { id },
    });

    return {
      message: 'Discount deleted successfully',
      status: 'success',
    };
  }

  /**
   * Get active discounts (for public/customer view)
   */
  async getActive() {
    const now = new Date();
    const discounts = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        name: true,
        type: true,
        value: true,
        target: true,
        minOrderAmount: true,
        maxDiscountAmt: true,
        startsAt: true,
        expiresAt: true,
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Active discounts retrieved',
      status: 'success',
      data: discounts,
    };
  }

  /**
   * Validate and calculate discount for an order
   * This is the core method used when creating an order
   */
  async validateAndCalculate(
    discountId: number,
    orderItems: { variantId: number; quantity: number; price: number }[],
    orderTotal: number,
  ): Promise<DiscountCalculation> {
    // 1. Fetch discount
    const discount = await this.prisma.discount.findUnique({
      where: { id: discountId },
      include: {
        category: true,
        discountVariants: true,
      },
    });

    if (!discount) {
      throw new BadRequestException('Discount not found');
    }

    // 2. Validate status
    if (!discount.isActive) {
      throw new BadRequestException('Discount is not active');
    }

    // 3. Validate date range
    const now = new Date();
    if (discount.startsAt > now) {
      throw new BadRequestException('Discount has not started yet');
    }
    if (discount.expiresAt && discount.expiresAt < now) {
      throw new BadRequestException('Discount has expired');
    }

    // 4. Validate max usage
    if (discount.maxUsage && discount.usageCount >= discount.maxUsage) {
      throw new BadRequestException('Discount usage limit reached');
    }

    // 5. Validate minimum order amount
    if (
      discount.minOrderAmount &&
      orderTotal < Number(discount.minOrderAmount)
    ) {
      throw new BadRequestException(
        `Minimum order amount of ${discount.minOrderAmount} required to use this discount`,
      );
    }

    // 6. Validate target (specific category or variants)
    const variantIds = orderItems.map((item) => item.variantId);
    const categoryId = discount.category?.id;
    const discountVariantIds =
      discount.discountVariants?.map((dv) => dv.variantId) || [];

    if (discount.target === 'SPECIFIC_CATEGORY' && categoryId) {
      // Check if order contains items from the specific category
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: true },
      });

      const hasMatchingCategory = variants.some(
        (v) => v.product.categoryId === categoryId,
      );

      if (!hasMatchingCategory) {
        throw new BadRequestException(
          `This discount is only valid for items in the ${discount.category?.name} category`,
        );
      }
    }

    if (
      discount.target === 'SPECIFIC_VARIANTS' &&
      discountVariantIds.length > 0
    ) {
      // Check if order contains any of the specific variants
      const hasMatchingVariant = variantIds.some((vid) =>
        discountVariantIds.includes(vid),
      );

      if (!hasMatchingVariant) {
        throw new BadRequestException(
          'This discount is not applicable to any items in your cart',
        );
      }
    }

    // 7. Calculate discount amount
    let appliedAmount = 0;

    // Calculate eligible amount based on target
    let eligibleAmount = orderTotal;

    if (discount.target === 'SPECIFIC_CATEGORY' && categoryId) {
      // Only calculate discount on items from that category
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: true },
      });

      let categoryAmount = 0;
      for (const item of orderItems) {
        const variant = variants.find((v) => v.id === item.variantId);
        if (variant && variant.product.categoryId === categoryId) {
          categoryAmount += item.price * item.quantity;
        }
      }
      eligibleAmount = categoryAmount;
    }

    if (
      discount.target === 'SPECIFIC_VARIANTS' &&
      discountVariantIds.length > 0
    ) {
      // Only calculate discount on specific variants
      let variantAmount = 0;
      for (const item of orderItems) {
        if (discountVariantIds.includes(item.variantId)) {
          variantAmount += item.price * item.quantity;
        }
      }
      eligibleAmount = variantAmount;
    }

    // Apply the discount calculation
    if (discount.type === 'PERCENTAGE') {
      appliedAmount = (eligibleAmount * Number(discount.value)) / 100;

      // Apply cap if set
      if (discount.maxDiscountAmt) {
        appliedAmount = Math.min(
          appliedAmount,
          Number(discount.maxDiscountAmt),
        );
      }
    } else {
      // Fixed amount
      appliedAmount = Number(discount.value);
    }

    // Don't allow discount > eligible amount
    appliedAmount = Math.min(appliedAmount, eligibleAmount);

    return {
      discountId: discount.id,
      type: discount.type as 'PERCENTAGE' | 'FIXED',
      value: discount.value,
      appliedAmount,
    };
  }

  /**
   * Apply discount to an order and increment usage count
   * Must be called within a transaction
   */
  async applyToOrder(tx: any, discountId: number, orderId: number) {
    await tx.discount.update({
      where: { id: discountId },
      data: {
        usageCount: { increment: 1 },
      },
    });
  }
}
