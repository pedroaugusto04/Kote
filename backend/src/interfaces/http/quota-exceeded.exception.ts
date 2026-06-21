import { HttpException, HttpStatus } from '@nestjs/common';

export class QuotaExceededException extends HttpException {
  constructor(resourceType: string, limit: number, current: number) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Quota Exceeded',
        code: 'QUOTA_EXCEEDED',
        message: `You have reached the limit of ${limit} for ${resourceType}. Current usage: ${current}.`,
        resourceType,
        limit,
        current,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
