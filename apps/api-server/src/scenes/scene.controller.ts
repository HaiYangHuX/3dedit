import {
  copySceneInputSchema,
  createSceneInputSchema,
  reorderScenesInputSchema,
  saveSceneInputSchema,
  updateSceneInputSchema,
  type CopySceneInput,
  type CreateSceneInput,
  type ReorderScenesInput,
  type SaveSceneInput,
  type SceneDetail,
  type SceneSummary,
  type UpdateSceneInput,
} from '@digital-twin/api-contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SceneService } from './scene.service.js';

@ApiTags('scenes')
@Controller()
export class SceneController {
  constructor(@Inject(SceneService) private readonly scenes: SceneService) {}

  @Post('projects/:projectId/scenes')
  create(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createSceneInputSchema))
    input: CreateSceneInput,
  ): Promise<SceneDetail> {
    return this.scenes.create(projectId, input);
  }

  @Put('projects/:projectId/scenes/order')
  reorder(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(reorderScenesInputSchema))
    input: ReorderScenesInput,
  ): Promise<SceneSummary[]> {
    return this.scenes.reorder(projectId, input);
  }

  @Get('scenes/:id')
  get(@Param('id') id: string): Promise<SceneDetail> {
    return this.scenes.get(id);
  }

  @Patch('scenes/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSceneInputSchema))
    input: UpdateSceneInput,
  ): Promise<SceneDetail> {
    return this.scenes.update(id, input);
  }

  @Post('scenes/:id/copy')
  copy(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(copySceneInputSchema))
    input: CopySceneInput,
  ): Promise<SceneDetail> {
    return this.scenes.copy(id, input);
  }

  @Put('scenes/:id/document')
  save(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveSceneInputSchema)) input: SaveSceneInput,
  ): Promise<SceneDetail> {
    return this.scenes.save(id, input);
  }

  @Delete('scenes/:id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.scenes.remove(id);
  }
}
