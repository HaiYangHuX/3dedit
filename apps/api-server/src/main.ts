import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

/** 创建 Fastify 应用并统一暴露 /api 路由。 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('数字孪生场景平台 API')
    .setDescription('项目、场景、模型库与发布运行时契约')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, () =>
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  // 启动失败必须设置非零退出码，使容器编排器能够重启实例。
  console.error(error);
  process.exitCode = 1;
});
