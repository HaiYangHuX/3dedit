import {
  publishSceneInputSchema,
  type PublicationDetail,
  type PublicationManifest,
  type PublishSceneInput,
} from '@digital-twin/api-contracts';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PublicationService } from './publication.service.js';

@ApiTags('publications')
@Controller()
export class PublicationController {
  constructor(
    @Inject(PublicationService)
    private readonly publications: PublicationService,
  ) {}

  @Post('projects/:projectId/publication')
  publish(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(publishSceneInputSchema))
    input: PublishSceneInput,
  ): Promise<PublicationDetail> {
    return this.publications.publish(projectId, input);
  }

  @Get('projects/:projectId/publication')
  current(@Param('projectId') projectId: string): Promise<PublicationDetail> {
    return this.publications.getCurrent(projectId);
  }

  @Get('publications/:id/manifest')
  manifest(@Param('id') id: string): Promise<PublicationManifest> {
    return this.publications.getManifest(id);
  }

  @Get('publications/:id/assets/:assetId')
  async asset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const url = await this.publications.getAssetUrl(id, assetId);
    await reply.redirect(url, 302);
  }
}
