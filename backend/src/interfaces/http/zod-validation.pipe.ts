import { Injectable, type PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
import type { ZodError, ZodTypeDef } from 'zod';
import { ValidationException, AppErrorCode } from '../../domain/exceptions/index.js';

function validationDetails(error: ZodError): Record<string, unknown> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
  }

  return {
    issues: error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.join('.'),
      message: issue.message,
    })),
    fieldErrors,
  };
}

@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(
    private readonly schema: ZodType<TOutput, ZodTypeDef, unknown>,
    private readonly errorCode: AppErrorCode,
  ) {}

  transform(value: unknown) {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new ValidationException(this.errorCode, validationDetails(parsed.error));
    }
    return parsed.data;
  }
}
