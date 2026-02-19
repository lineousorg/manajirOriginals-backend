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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';

@ApiTags('Attributes')
@Controller('attributes')
export class AttributeController {
  constructor(private readonly attributeService: AttributeService) {}

  /**
   * Create a new attribute
   */
  @Post()
  @ApiOperation({ summary: 'Create a new attribute', description: 'Public endpoint' })
  @ApiBody({ type: CreateAttributeDto })
  @ApiResponse({ status: 201, description: 'Attribute created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  create(@Body() dto: CreateAttributeDto) {
    return this.attributeService.create(dto);
  }

  /**
   * Get all attributes
   */
  @Get()
  @ApiOperation({ summary: 'Get all attributes', description: 'Public endpoint' })
  @ApiResponse({ status: 200, description: 'Returns all attributes' })
  findAll() {
    return this.attributeService.findAll();
  }

  /**
   * Get a single attribute by ID with its values
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get an attribute by ID', description: 'Public endpoint' })
  @ApiParam({ name: 'id', type: Number, description: 'Attribute ID' })
  @ApiResponse({ status: 200, description: 'Returns the attribute with values' })
  @ApiResponse({ status: 404, description: 'Attribute not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.attributeService.findOne(id);
  }

  /**
   * Update an attribute
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update an attribute', description: 'Public endpoint' })
  @ApiParam({ name: 'id', type: Number, description: 'Attribute ID' })
  @ApiBody({ type: UpdateAttributeDto })
  @ApiResponse({ status: 200, description: 'Attribute updated successfully' })
  @ApiResponse({ status: 404, description: 'Attribute not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttributeDto,
  ) {
    return this.attributeService.update(id, dto);
  }

  /**
   * Delete an attribute
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an attribute', description: 'Public endpoint - deletes associated values too' })
  @ApiParam({ name: 'id', type: Number, description: 'Attribute ID' })
  @ApiResponse({ status: 200, description: 'Attribute deleted successfully' })
  @ApiResponse({ status: 404, description: 'Attribute not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.attributeService.remove(id);
  }
}
