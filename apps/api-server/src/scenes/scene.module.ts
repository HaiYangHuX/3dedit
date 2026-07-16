import { Module } from '@nestjs/common';
import { SceneController } from './scene.controller.js';
import { SceneService } from './scene.service.js';

@Module({
  controllers: [SceneController],
  providers: [SceneService],
  exports: [SceneService],
})
export class SceneModule {}
