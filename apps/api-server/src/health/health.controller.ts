import type { HealthResponse } from '@digital-twin/api-contracts';
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';

/** 提供给 Docker、网关与运维面板的无鉴权健康端点。 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get()
  @ApiOperation({ summary: '检查 PostgreSQL、Redis 和 MinIO' })
  check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
