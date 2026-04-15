import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, Max, IsBoolean } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  /**
   * Whether to include stock info in the response.
   * Set to false to skip the stock reservation query for better performance.
   * Default: true (include stock info)
   */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeStock?: boolean = true;
}

export interface PaginatedResponse<T> {
  message: string;
  status: string;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  message: string,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    message,
    status: 'success',
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}
