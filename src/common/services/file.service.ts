/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, BadRequestException } from '@nestjs/common';
import * as multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

// Allowed file types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

// Allowed extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface UploadedFile {
  filename: string;
  originalName: string;
  path: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class FileService {
  private readonly uploadBasePath = path.join(
    process.cwd(),
    'public',
    'uploads',
  );

  constructor() {
    // Create directories if they don't exist
    this.ensureDirectoriesExist();
  }

  private ensureDirectoriesExist(): void {
    const dirs = ['products', 'categories', 'variants'];
    for (const dir of dirs) {
      const dirPath = path.join(this.uploadBasePath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  /**
   * Get multer storage configuration
   */
  getStorage(type: 'products' | 'categories' | 'variants') {
    return multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(this.uploadBasePath, type);
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname).toLowerCase();
        const baseName = path
          .basename(file.originalname, ext)
          .replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${uniqueSuffix}-${baseName}${ext}`);
      },
    });
  }

  /**
   * File filter function
   */
  fileFilter(
    req: any,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new BadRequestException(
          `Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
        ),
      );
      return;
    }

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      cb(
        new BadRequestException(
          `Invalid file extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
        ),
      );
      return;
    }

    cb(null, true);
  }

  /**
   * Get multer options
   */
  getMulterOptions(type: 'products' | 'categories' | 'variants') {
    return {
      storage: this.getStorage(type),
      fileFilter: this.fileFilter.bind(this),
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
    };
  }

  /**
   * Get the public URL path for a file
   */
  getPublicPath(
    filename: string,
    type: 'products' | 'categories' | 'variants',
  ): string {
    return `/public/uploads/${type}/${filename}`;
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      // Remove /public prefix if present
      const relativePath = filePath.replace(/^\/public\//, '');
      const fullPath = path.join(process.cwd(), 'public', relativePath);

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(filePaths: string[]): Promise<void> {
    await Promise.all(filePaths.map((path) => this.deleteFile(path)));
  }
}
