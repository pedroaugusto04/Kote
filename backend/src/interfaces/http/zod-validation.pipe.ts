import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

function validationDetails(error: ZodError): Record<string, unknown> {
  return {
    issues: error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(
    private readonly schema: ZodType<TOutput>,
    private readonly errorCode: string,
  ) {}

  transform(value: unknown) {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException({ code: this.errorCode, details: validationDetails(parsed.error) });
    return parsed.data;
  }
}
