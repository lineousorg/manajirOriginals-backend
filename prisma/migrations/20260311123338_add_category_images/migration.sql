-- AlterEnum
ALTER TYPE "ImageType" ADD VALUE 'CATEGORY';

-- AlterTable
ALTER TABLE "Image" ADD COLUMN     "categoryId" INTEGER;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
