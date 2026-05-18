/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryAttributeDto,
  UpdateCategoryAttributeDto,
} from './dto/create-category-attribute.dto';

@Injectable()
export class CategoryAttributeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolve a category identifier (slug or ID string) to a category ID.
   * Supports both slug strings and numeric ID strings.
   */
  private async resolveCategoryId(slug: string): Promise<number> {
    const isId = /^\d+$/.test(slug);

    if (isId) {
      const category = await this.prisma.category.findUnique({
        where: { id: parseInt(slug, 10) },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException(`Category not found: ${slug}`);
      }
      return category.id;
    }

    const category = await this.prisma.category.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException(`Category not found: ${slug}`);
    }

    return category.id;
  }

  /**
   * Get all attributes assigned to a category (by slug or ID).
   * Traverses parent hierarchy to include inherited attributes.
   * Each attribute includes its selected value IDs (if in SELECTED mode)
   * and the full list of attribute values for frontend rendering.
   */
  async getByCategorySlug(slug: string) {
    const categoryId = await this.resolveCategoryId(slug);

    const categoryIds = await this.collectAncestorIds(categoryId);
    categoryIds.push(categoryId);

    const categoryAttributes = await this.prisma.categoryAttribute.findMany({
      where: {
        categoryId: { in: categoryIds },
        attribute: { isDeleted: false },
      },
      include: {
        attribute: {
          include: {
            values: {
              where: { isDeleted: false },
              orderBy: { value: 'asc' },
            },
          },
        },
        selectedValues: {
          include: {
            value: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Map selectedValues to a flat array of value IDs for each category attribute
    const enriched = categoryAttributes.map((ca) => ({
      ...ca,
      valueIds: ca.selectedValues.map((sv) => sv.valueId),
      selectedValues: undefined,
    }));

    return {
      message: 'Category attributes retrieved successfully',
      status: 'success',
      data: enriched,
    };
  }

  /**
   * Assign an attribute to a category, optionally with value restriction settings.
   *
   * valueRestrictionMode:
   *   - ALL      (default): all attribute values are available
   *   - SELECTED: only the provided valueIds are available
   *   - NONE:    no values are available
   *
   * When valueRestrictionMode is SELECTED, valueIds must be provided and
   * every ID must belong to the specified attribute.
   */
  async assignAttribute(slug: string, dto: CreateCategoryAttributeDto) {
    const categoryId = await this.resolveCategoryId(slug);

    const attribute = await this.prisma.attribute.findUnique({
      where: { id: dto.attributeId },
    });

    if (!attribute || attribute.isDeleted) {
      throw new NotFoundException('Attribute not found');
    }

    const existing = await this.prisma.categoryAttribute.findUnique({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId: dto.attributeId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Attribute is already assigned to this category',
      );
    }

    // Validate valueIds belong to the attribute when SELECTED mode is used
    const mode = dto.valueRestrictionMode ?? 'ALL';
    if (mode === 'SELECTED') {
      if (!dto.valueIds || dto.valueIds.length === 0) {
        throw new BadRequestException(
          'valueIds must be provided when valueRestrictionMode is SELECTED',
        );
      }
      await this.validateValueIdsBelongToAttribute(
        dto.attributeId,
        dto.valueIds,
      );
    }

    // Create the category-attribute link and (optionally) its selected values
    const categoryAttribute = await this.prisma.categoryAttribute.create({
      data: {
        categoryId,
        attributeId: dto.attributeId,
        sortOrder: dto.sortOrder ?? 0,
        isRequired: dto.isRequired ?? false,
        isVariantSelectable: dto.isVariantSelectable ?? true,
        valueRestrictionMode: mode,
        ...(mode === 'SELECTED' && dto.valueIds
          ? {
              selectedValues: {
                create: dto.valueIds.map((valueId) => ({ valueId })),
              },
            }
          : {}),
      },
      include: {
        attribute: {
          include: { values: { where: { isDeleted: false } } },
        },
        selectedValues: {
          include: { value: true },
        },
      },
    });

    // Flatten selectedValues to valueIds in the response
    const { selectedValues, ...rest } = categoryAttribute;
    return {
      message: 'Attribute assigned to category successfully',
      status: 'success',
      data: {
        ...rest,
        valueIds: selectedValues.map((sv) => sv.valueId),
      },
    };
  }

  /**
   * Remove an attribute from a category
   */
  async removeAttribute(slug: string, attributeId: number) {
    const categoryId = await this.resolveCategoryId(slug);

    const categoryAttribute = await this.prisma.categoryAttribute.findUnique({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
    });

    if (!categoryAttribute) {
      throw new NotFoundException('Attribute is not assigned to this category');
    }

    await this.prisma.categoryAttribute.delete({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
    });

    return {
      message: 'Attribute removed from category successfully',
      status: 'success',
      data: null,
    };
  }

  /**
   * Update category attribute settings (sortOrder, isRequired, isVariantSelectable,
   * valueRestrictionMode, valueIds).
   *
   * When valueRestrictionMode is changed to SELECTED, valueIds must be provided.
   * When valueRestrictionMode is changed away from SELECTED, existing selected values
   * are cleared.
   * When valueIds are provided while in SELECTED mode, existing selections are replaced.
   */
  async updateAttribute(
    slug: string,
    attributeId: number,
    dto: UpdateCategoryAttributeDto,
  ) {
    const categoryId = await this.resolveCategoryId(slug);

    const categoryAttribute = await this.prisma.categoryAttribute.findUnique({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
      include: {
        selectedValues: true,
      },
    });

    if (!categoryAttribute) {
      throw new NotFoundException('Attribute is not assigned to this category');
    }

    // Determine the new mode (defaults to current if not provided)
    const newMode =
      dto.valueRestrictionMode ?? categoryAttribute.valueRestrictionMode;

    // Validate valueIds if switching to or staying in SELECTED mode
    if (newMode === 'SELECTED') {
      if (!dto.valueIds || dto.valueIds.length === 0) {
        throw new BadRequestException(
          'valueIds must be provided when valueRestrictionMode is SELECTED',
        );
      }
      await this.validateValueIdsBelongToAttribute(attributeId, dto.valueIds);
    }

    // Build the update payload
    const updateData: Record<string, unknown> = {
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
      ...(dto.isVariantSelectable !== undefined && {
        isVariantSelectable: dto.isVariantSelectable,
      }),
      ...(dto.valueRestrictionMode !== undefined && {
        valueRestrictionMode: dto.valueRestrictionMode,
      }),
    };

    // Handle selected values update
    const hasValueIds = dto.valueIds !== undefined;
    if (hasValueIds && newMode === 'SELECTED') {
      // Replace all selected values — dto.valueIds is guarded non-undefined above
      updateData.selectedValues = {
        deleteMany: {},
        create: dto?.valueIds?.map((valueId) => ({ valueId })),
      };
    } else if (
      newMode !== 'SELECTED' &&
      categoryAttribute.selectedValues.length > 0
    ) {
      // Clear selected values when not in SELECTED mode
      updateData.selectedValues = {
        deleteMany: {},
      };
    }

    const updated = await this.prisma.categoryAttribute.update({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
      data: updateData,
      include: {
        attribute: {
          include: { values: { where: { isDeleted: false } } },
        },
        selectedValues: {
          include: { value: true },
        },
      },
    });

    // Flatten selectedValues to valueIds in the response
    const { selectedValues, ...rest } = updated;
    return {
      message: 'Category attribute updated successfully',
      status: 'success',
      data: {
        ...rest,
        valueIds: selectedValues.map((sv) => sv.valueId),
      },
    };
  }

  /**
   * Validate that every valueId belongs to the given attribute.
   * Throws BadRequestException if any valueId is not found or belongs to a different attribute.
   */
  private async validateValueIdsBelongToAttribute(
    attributeId: number,
    valueIds: number[],
  ): Promise<void> {
    const values = await this.prisma.attributeValue.findMany({
      where: {
        id: { in: valueIds },
        isDeleted: false,
      },
      select: { id: true, attributeId: true },
    });

    const foundIds = new Set(values.map((v) => v.id));
    const missingIds = valueIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(
        `The following value IDs do not exist or are deleted: ${missingIds.join(', ')}`,
      );
    }

    const wrongAttribute = values.find((v) => v.attributeId !== attributeId);
    if (wrongAttribute) {
      throw new BadRequestException(
        `Value ${wrongAttribute.id} does not belong to attribute ${attributeId}`,
      );
    }
  }

  /**
   * Helper: recursively collect all ancestor category IDs
   */
  private async collectAncestorIds(
    categoryId: number,
    ids: number[] = [],
  ): Promise<number[]> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { parentId: true },
    });

    if (category?.parentId) {
      ids.push(category.parentId);
      await this.collectAncestorIds(category.parentId, ids);
    }

    return ids;
  }
}
