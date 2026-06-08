import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CategoryAttributeService } from './category-attribute.service';
import {
  CreateCategoryAttributeDto,
  UpdateCategoryAttributeDto,
} from './dto/create-category-attribute.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('categories')
export class CategoryAttributeController {
  constructor(
    private readonly categoryAttributeService: CategoryAttributeService,
  ) {}

  /**
   * Get all attributes for a category (including inherited from parent categories)
   * GET /categories/:slug/attributes
   *
   * Response:
   * {
   *   "message": "Category attributes retrieved successfully",
   *   "status": "success",
   *   "data": [
   *     {
   *       "categoryId": 1,
   *       "attributeId": 1,
   *       "sortOrder": 0,
   *       "isRequired": false,
   *       "isVariantSelectable": true,
   *       "valueRestrictionMode": "SELECTED",
   *       "valueIds": [1, 2],
   *       "attribute": {
   *         "id": 1,
   *         "name": "Color",
   *         "values": [
   *           { "id": 1, "value": "Red", ... },
   *           { "id": 2, "value": "Blue", ... }
   *         ]
   *       }
   *     }
   *   ]
   * }
   */
  @Get(':slug/attributes')
  getAttributes(@Param('slug') slug: string) {
    return this.categoryAttributeService.getByCategorySlug(slug);
  }

  /**
   * Assign an attribute to a category
   * POST /categories/:slug/attributes
   *
   * Request Body:
   * {
   *   "attributeId": 1,
   *   "sortOrder": 0,
   *   "isRequired": false,
   *   "isVariantSelectable": true,
   *   "valueRestrictionMode": "SELECTED",  // "ALL" | "SELECTED" | "NONE"
   *   "valueIds": [1, 2, 3]                // required when mode is "SELECTED"
   * }
   *
   * valueRestrictionMode:
   *   ALL      - all attribute values are available (default, backward compatible)
   *   SELECTED - only the provided valueIds are available
   *   NONE     - no values are available (attribute effectively disabled)
   */
  @Post(':slug/attributes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  assignAttribute(
    @Param('slug') slug: string,
    @Body() dto: CreateCategoryAttributeDto,
  ) {
    return this.categoryAttributeService.assignAttribute(slug, dto);
  }

  /**
   * Update category attribute settings (sortOrder, isRequired, isVariantSelectable,
   * valueRestrictionMode, valueIds)
   * PATCH /categories/:slug/attributes/:attributeId
   */
  @Patch(':slug/attributes/:attributeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateAttribute(
    @Param('slug') slug: string,
    @Param('attributeId', ParseIntPipe) attributeId: number,
    @Body() dto: UpdateCategoryAttributeDto,
  ) {
    return this.categoryAttributeService.updateAttribute(
      slug,
      attributeId,
      dto,
    );
  }

  /**
   * Remove an attribute from a category
   * DELETE /categories/:slug/attributes/:attributeId
   */
  @Delete(':slug/attributes/:attributeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  removeAttribute(
    @Param('slug') slug: string,
    @Param('attributeId', ParseIntPipe) attributeId: number,
  ) {
    return this.categoryAttributeService.removeAttribute(slug, attributeId);
  }
}
