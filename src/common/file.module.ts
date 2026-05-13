import { Module } from '@nestjs/common';
import { CommonModule } from './common.module';
import { FileService } from './services/file.service';
import { FileController } from './controllers/file.controller';

@Module({
  imports: [CommonModule],
  providers: [FileService],
  controllers: [FileController],
  exports: [FileService],
})
export class FileModule {}
