import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { ProjectModule } from './projects/project.module.js';
import { SceneModule } from './scenes/scene.module.js';

/** 首期模块化单体入口，后续业务域按 Nest Module 水平拆分而非拆成微服务。 */
@Module({
  imports: [InfrastructureModule, ProjectModule, SceneModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
