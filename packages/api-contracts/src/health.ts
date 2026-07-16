/**
 * 平台健康检查的稳定响应契约。
 * degraded 仍通过 HTTP 200 返回，便于运维端同时看到所有依赖的状态。
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  services: {
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
    minio: 'up' | 'down';
  };
  timestamp: string;
}
