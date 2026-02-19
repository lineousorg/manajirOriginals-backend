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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';

@ApiTags('Attribute Values')
@Controller('attribute-values')
export class AttributeValueController {
  constructor(private readonly attributeValueService: AttributeValueService) {}

  /**
   * Create a new attribute value
   */
  @Post()
  @ApiOperation({ summary: 'Create a new attribute value', description: 'Public endpoint' })
  @ApiBody({ type: CreateAttributeValueDto })
  @ApiResponse({ status: 201, description: 'Attribute value created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  create(@Body() dto: CreateAttributeValueDto) {
    return this.attributeValueService.create(dto);
  }

  /**
   * Get all attribute values with their parent attribute info
   */
  @Get()
  @ApiOperation({ summary: 'Get all attribute values', description: 'Public endpoint' })
  @ApiResponse({ status: 200, description: 'Returns all attribute values' })
  findAll() {
    return this.attributeValueService.findAll();
  }

  /**
   * Get all values for a specific attribute
   */
  @Get('attribute/:attributeId')
  @ApiOperation({ summary: 'Get attribute values by attribute ID', description: 'Public endpoint' })
  @ApiParam({ name: 'attributeId', type: Number, description: 'Attribute ID' })
  @ApiResponse({ status: 200, description: 'Returns attribute values for the attribute' })
  findByAttribute(@Param('attributeId', ParseIntPipe) attributeId: number) {
    return this.attributeValueService.findByAttribute(attributeId);
  }

  /**
   * Get a single attribute value by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get an attribute value by ID', description: 'Public endpoint' })
  @ApiParam({ name: 'id', type: Number, description: 'Attribute Value ID' })
  @ApiResponse({ status: 200, description: 'Returns the attribute value' })
  @ApiResponse({ status: 404, description: 'Attribute value not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.attributeValueService.findOne(id);
  }

  /**
   * Update an attribute value
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update an attribute value', description: 'Public endpoint' })
  @ApiParam({ name: 'id', type: Number, description: 'Attribute Value ID' })
  @ApiBody({ type: UpdateAttributeValueDto })
  @ApiResponse({ status: 200, description: 'Attribute value updated successfully' })
  @ApiResponse({ status: 404, description: 'Attribute value not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttributeValueDto,
  ) {
    return this.attributeValueService.update(id, dto);
  }

  /**
   * Delete an attribute value
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an attribute value', description: 'Public endpoint - removes from variant attributes too' })
  @ApiParam({ name: 'id', type: Number, description: 'Attribute Value ID' })
  @ApiResponse({ status: 200, description: 'Attribute value deleted successfully' })
  @ApiResponse({ status: 404, description: 'Attribute value not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.attributeValueService.remove(id);
  }
}
