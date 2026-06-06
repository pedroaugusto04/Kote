import { Module } from '@nestjs/common';
import { RuntimeEnvironmentProvider } from '../../application/ports/observability/runtime-environment.port.js';
import { ProcessRuntimeEnvironmentProvider } from '../runtime/runtime-environment.provider.js';

@Module({
  providers: [
    ProcessRuntimeEnvironmentProvider,
    { provide: RuntimeEnvironmentProvider, useExisting: ProcessRuntimeEnvironmentProvider },
  ],
  exports: [RuntimeEnvironmentProvider],
})
export class EnvModule {}
