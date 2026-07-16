import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * 在 Nest 边界执行共享 Zod 契约，避免 Controller 与前端各自维护一套校验规则。
 * 返回值使用 Zod 解析后的数据，因此 trim/default 等转换会真正进入业务层。
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '请求参数校验失败',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
