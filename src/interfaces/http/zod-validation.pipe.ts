import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(
    private readonly schema: ZodType<TOutput>,
    private readonly errorCode: string,
  ) {}

  transform(value: unknown) {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(this.errorCode);
    return parsed.data;
  }
}
