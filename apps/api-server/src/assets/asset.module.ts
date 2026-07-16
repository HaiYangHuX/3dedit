import { Module } from '@nestjs/common';
import { UploadModule } from '../uploads/upload.module.js';
import { AssetController } from './asset.controller.js';
import { AssetService } from './asset.service.js';

@Module({
  imports: [UploadModule],
  controllers: [AssetController],
  providers: [AssetService],
  exports: [AssetService],
})
export class AssetModule {}
