import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { AttributeValueService } from './attribute-value.service';
import {
  CreateAttributeValueDto,
  UpdateAttributeValueDto,
} from './dto/create-attribute-value.dto';

@Controller('attribute-values')
export class AttributeValueController {
  constructor(private readonly attributeValueService: AttributeValueService) {}

  /**
   * Create a new attribute value
   * POST /attribute-values
   *
   * Request Body:
   * {
   *   "value": "Red",        // Required - the value name (e.g., "Red", "Large", "Cotton")
   *   "attributeId": 1       // Required - the ID of the parent attribute
   * }
   *
   * Response:
   * {
   *   "message": "Attribute value created successfully",
   *   "status": "success",
   *   "data": {
   *     "id": 1,
   *     "value": "Red",
   *     "attributeId": 1
   *   }
   * }
   */
  @Post()
  create(@Body() dto: CreateAttributeValueDto) {
    return this.attributeValueService.create(dto);
  }

  /**
   * Get all attribute values with their parent attribute info
   * GET /attribute-values
   *
   * Response:
   * {
   *   "message": "Attribute values retrieved successfully",
   *   "status": "success",
   *   "data": [
   *     {
   *       "id": 1,
   *       "value": "Red",
   *       "attributeId": 1,
   *       "attribute": { "id": 1, "name": "Color" }
   *     },
   *     {
   *       "id": 2,
   *       "value": "Blue",
   *       "attributeId": 1,
   *       "attribute": { "id": 1, "name": "Color" }
   *     }
   *   ]
   * }
   */
  @Get()
  findAll() {
    return this.attributeValueService.findAll();
  }

  /**
   * Get all values for a specific attribute
   * GET /attribute-values/attribute/:attributeId
   *
   * Example: GET /attribute-values/attribute/1
   *
   * Response:
   * {
   *   "message": "Attribute values retrieved successfully",
   *   "status": "success",
   *   "data": [
   *     { "id": 1, "value": "Red", "attributeId": 1 },
   *     { "id": 2, "value": "Blue", "attributeId": 1 }
   *   ]
   * }
   */
  @Get('attribute/:attributeId')
  findByAttribute(@Param('attributeId', ParseIntPipe) attributeId: number) {
    return this.attributeValueService.findByAttribute(attributeId);
  }

  /**
   * Get a single attribute value by ID
   * GET /attribute-values/:id
   *
   * Response:
   * {
   *   "message": "Attribute value retrieved successfully",
   *   "status": "success",
   *   "data": {
   *     "id": 1,
   *     "value": "Red",
   *     "attributeId": 1,
   *     "attribute": { "id": 1, "name": "Color" }
   *   }
   * }
   */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.attributeValueService.findOne(id);
  }

  /**
   * Update an attribute value
   * PATCH /attribute-values/:id
   *
   * Request Body:
   * {
   *   "value": "Navy Blue"  // Optional - new value name
   * }
   *
   * Response:
   * {
   *   "message": "Attribute value updated successfully",
   *   "status": "success",
   *   "data": {
   *     "id": 1,
   *     "value": "Navy Blue",
   *     "attributeId": 1
   *   }
   * }
   */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttributeValueDto,
  ) {
    return this.attributeValueService.update(id, dto);
  }

  /**
   * Delete an attribute value
   * DELETE /attribute-values/:id
   *
   * Note: This will also remove the value from all variant attributes
   *
   * Response:
   * {
   *   "message": "Attribute value deleted successfully",
   *   "status": "success",
   *   "data": null
   * }
   */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.attributeValueService.remove(id);
  }
}
