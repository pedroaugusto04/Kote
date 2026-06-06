import { Module } from '@nestjs/common';
import { AppLogger } from '../../observability/logger.js';
import { GlobalExceptionFilter } from '../../observability/global-exception.filter.js';

@Module({
  providers: [AppLogger, GlobalExceptionFilter],
  exports: [AppLogger, GlobalExceptionFilter],
})
export class LoggerModule {}
