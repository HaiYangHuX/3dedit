import {
  listAssetsQuerySchema,
  updateAssetInputSchema,
  type AssetDetail,
  type AssetListResponse,
  type ListAssetsQuery,
  type UpdateAssetInput,
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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AssetService } from './asset.service.js';

@ApiTags('assets')
@Controller('assets')
export class AssetController {
  constructor(@Inject(AssetService) private readonly assets: AssetService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listAssetsQuerySchema)) query: ListAssetsQuery,
  ): Promise<AssetListResponse> {
    return this.assets.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<AssetDetail> {
    return this.assets.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAssetInputSchema))
    input: UpdateAssetInput,
  ): Promise<AssetDetail> {
    return this.assets.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.assets.remove(id);
  }
}
