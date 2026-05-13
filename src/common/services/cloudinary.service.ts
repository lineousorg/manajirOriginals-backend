/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async upload(filePath: string, folder: string = 'products') {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: `manajir/${folder}`,
      });
      return result;
    } catch (error) {
      throw new BadRequestException('Failed to upload image to Cloudinary');
    }
  }

  async delete(publicId: string): Promise<boolean> {
    try {
      console.log('[CloudinaryService] Deleting image:', publicId);

      const result = await cloudinary.uploader.destroy(publicId);

      console.log('[CloudinaryService] Delete result:', result);

      return result.result === 'ok';
    } catch (error) {
      console.error('[CloudinaryService] Delete error:', error);

      return false;
    }
  }
}
