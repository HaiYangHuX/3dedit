import {
  completeUploadInputSchema,
  createUploadInputSchema,
  type CompleteUploadInput,
  type CreateUploadInput,
  type UploadCompletion,
  type UploadSession,
} from '@digital-twin/api-contracts';
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UploadService } from './upload.service.js';

@ApiTags('uploads')
@Controller('uploads')
export class UploadController {
  constructor(@Inject(UploadService) private readonly uploads: UploadService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createUploadInputSchema))
    input: CreateUploadInput,
  ): Promise<UploadSession> {
    return this.uploads.create(input);
  }

  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeUploadInputSchema))
    input: CompleteUploadInput,
  ): Promise<UploadCompletion> {
    return this.uploads.complete(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  cancel(@Param('id') id: string): Promise<void> {
    return this.uploads.cancel(id);
  }
}
