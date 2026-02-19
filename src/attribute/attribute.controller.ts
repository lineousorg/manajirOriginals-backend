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
import { AttributeService } from './attribute.service';
import {
  CreateAttributeDto,
  UpdateAttributeDto,
} from './dto/create-attribute.dto';

@Controller('attributes')
export class AttributeController {
  constructor(private readonly attributeService: AttributeService) {}

  /**
   * Create a new attribute
   * POST /attributes
   *
   * Request Body:
   * {
   *   "name": "Color"  // Required - unique name for the attribute
   * }
   *
   * Response:
   * {
   *   "message": "Attribute created successfully",
   *   "status": "success",
   *   "data": {
   *     "id": 1,
   *     "name": "Color"
   *   }
   * }
   */
  @Post()
  create(@Body() dto: CreateAttributeDto) {
    return this.attributeService.create(dto);
  }

  /**
   * Get all attributes
   * GET /attributes
   *
   * Response:
   * {
   *   "message": "Attributes retrieved successfully",
   *   "status": "success",
   *   "data": [
   *     { "id": 1, "name": "Color" },
   *     { "id": 2, "name": "Size" }
   *   ]
   * }
   */
  @Get()
  findAll() {
    return this.attributeService.findAll();
  }

  /**
   * Get a single attribute by ID with its values
   * GET /attributes/:id
   *
   * Response:
   * {
   *   "message": "Attribute retrieved successfully",
   *   "status": "success",
   *   "data": {
   *     "id": 1,
   *     "name": "Color",
   *     "values": [
   *       { "id": 1, "value": "Red", "attributeId": 1 },
   *       { "id": 2, "value": "Blue", "attributeId": 1 }
   *     ]
   *   }
   * }
   */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.attributeService.findOne(id);
  }

  /**
   * Update an attribute
   * PATCH /attributes/:id
   *
   * Request Body:
   * {
   *   "name": "New Color Name"  // Optional - new name for the attribute
   * }
   *
   * Response:
   * {
   *   "message": "Attribute updated successfully",
   *   "status": "success",
   *   "data": {
   *     "id": 1,
   *     "name": "New Color Name"
   *   }
   * }
   */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttributeDto,
  ) {
    return this.attributeService.update(id, dto);
  }

  /**
   * Delete an attribute
   * DELETE /attributes/:id
   *
   * Note: This will also delete all associated attribute values
   *
   * Response:
   * {
   *   "message": "Attribute deleted successfully",
   *   "status": "success",
   *   "data": null
   * }
   */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.attributeService.remove(id);
  }
}
