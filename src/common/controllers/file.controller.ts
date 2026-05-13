import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { FileService } from '../services/file.service';
import { CloudinaryService } from '../services/cloudinary.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('upload')
export class FileController {
  constructor(
    private readonly fileService: FileService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Upload product image
   * POST /upload/product
   * Access: Admin only
   */
  @Post('product')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/uploads/products',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname).toLowerCase();
          const baseName = file.originalname.replace(/[^a-zA-Z0-9]/g, '_');
          cb(null, `${uniqueSuffix}-${baseName}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
        ];
        if (!allowedTypes.includes(file.mimetype)) {
          cb(
            new Error('Invalid file type. Allowed: jpg, png, webp, gif'),
            false,
          );
          return;
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadProductImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Upload to Cloudinary
    const cloudinaryResult = await this.cloudinaryService.upload(
      file.path,
      'products',
    );

    // Delete the local file after successful upload
    const publicPath = `/public/uploads/products/${file.filename}`;
    await this.fileService.deleteFile(publicPath);

    return {
      message: 'Product image uploaded successfully',
      status: 'success',
      data: {
        filename: file.filename,
        originalName: file.originalname,
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        mimetype: file.mimetype,
        size: file.size,
      },
    };
  }

  /**
   * Upload category image
   * POST /upload/category
   * Access: Admin only
   */
  @Post('category')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/uploads/categories',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname).toLowerCase();
          const baseName = file.originalname.replace(/[^a-zA-Z0-9]/g, '_');
          cb(null, `${uniqueSuffix}-${baseName}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
        ];
        if (!allowedTypes.includes(file.mimetype)) {
          cb(
            new Error('Invalid file type. Allowed: jpg, png, webp, gif'),
            false,
          );
          return;
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadCategoryImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Upload to Cloudinary
    const cloudinaryResult = await this.cloudinaryService.upload(
      file.path,
      'categories',
    );

    // Delete the local file after successful upload
    const publicPath = `/public/uploads/categories/${file.filename}`;
    await this.fileService.deleteFile(publicPath);

    return {
      message: 'Category image uploaded successfully',
      status: 'success',
      data: {
        filename: file.filename,
        originalName: file.originalname,
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        mimetype: file.mimetype,
        size: file.size,
      },
    };
  }

  /**
   * Upload variant image
   * POST /upload/variant
   * Access: Admin only
   */
  @Post('variant')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/uploads/variants',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname).toLowerCase();
          const baseName = file.originalname.replace(/[^a-zA-Z0-9]/g, '_');
          cb(null, `${uniqueSuffix}-${baseName}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
        ];
        if (!allowedTypes.includes(file.mimetype)) {
          cb(
            new Error('Invalid file type. Allowed: jpg, png, webp, gif'),
            false,
          );
          return;
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadVariantImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Upload to Cloudinary
    const cloudinaryResult = await this.cloudinaryService.upload(
      file.path,
      'variants',
    );

    // Delete the local file after successful upload
    const publicPath = `/public/uploads/variants/${file.filename}`;
    await this.fileService.deleteFile(publicPath);

    return {
      message: 'Variant image uploaded successfully',
      status: 'success',
      data: {
        filename: file.filename,
        originalName: file.originalname,
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        mimetype: file.mimetype,
        size: file.size,
      },
    };
  }

  /**
   * Delete an uploaded file
   * DELETE /upload/:type/:filename
   * Access: Admin only
   */
  @Delete(':type/:filename')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteFile(
    @Param('type') type: 'products' | 'categories' | 'variants',
    @Param('filename') filename: string,
  ) {
    const filePath = `/public/uploads/${type}/${filename}`;
    const deleted = await this.fileService.deleteFile(filePath);

    if (!deleted) {
      throw new BadRequestException('File not found or could not be deleted');
    }

    return {
      message: 'File deleted successfully',
      status: 'success',
      data: null,
    };
  }
}
