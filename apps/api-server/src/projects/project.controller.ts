import {
  copyProjectInputSchema,
  createProjectInputSchema,
  listProjectsQuerySchema,
  updateProjectInputSchema,
  type CopyProjectInput,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ProjectDetail,
  type ProjectSummary,
  type UpdateProjectInput,
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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProjectService } from './project.service.js';

@ApiTags('projects')
@Controller('projects')
export class ProjectController {
  constructor(
    @Inject(ProjectService) private readonly projects: ProjectService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listProjectsQuerySchema))
    query: ListProjectsQuery,
  ): Promise<ProjectSummary[]> {
    return this.projects.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createProjectInputSchema))
    input: CreateProjectInput,
  ): Promise<ProjectDetail> {
    return this.projects.create(input);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ProjectDetail> {
    return this.projects.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProjectInputSchema))
    input: UpdateProjectInput,
  ): Promise<ProjectDetail> {
    return this.projects.update(id, input);
  }

  @Post(':id/copy')
  copy(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(copyProjectInputSchema))
    input: CopyProjectInput,
  ): Promise<ProjectDetail> {
    return this.projects.copy(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.projects.remove(id);
  }
}
