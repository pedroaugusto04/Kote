import { Injectable } from '@nestjs/common';

import { readEnvironment } from '../../adapters/environment.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../application/ports/observability/runtime-environment.port.js';

@Injectable()
export class ProcessRuntimeEnvironmentProvider extends RuntimeEnvironmentProvider {
  read(): RuntimeEnvironment {
    return readEnvironment();
  }
}
