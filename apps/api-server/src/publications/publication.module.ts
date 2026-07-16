import { Module } from '@nestjs/common';
import { PublicationController } from './publication.controller.js';
import { PublicationService } from './publication.service.js';

@Module({
  controllers: [PublicationController],
  providers: [PublicationService],
  exports: [PublicationService],
})
export class PublicationModule {}
