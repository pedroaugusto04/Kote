import { Injectable } from '@nestjs/common';

import { DependencyEcosystem } from '../../../contracts/enums.js';
import { CargoRegistryStrategy } from './cargo-registry.strategy.js';
import { ComposerRegistryStrategy } from './composer-registry.strategy.js';
import { MavenRegistryStrategy } from './maven-registry.strategy.js';
import { NpmRegistryStrategy } from './npm-registry.strategy.js';
import { PipRegistryStrategy } from './pip-registry.strategy.js';
import { RegistryStrategy } from './registry-strategy.interface.js';
import { RuntimeEnvironmentProvider } from '../observability/runtime-environment.port.js';

@Injectable()
export class RegistryStrategyProvider {
  private strategies: Map<string, RegistryStrategy>;

  constructor(private readonly environmentProvider: RuntimeEnvironmentProvider) {
    const env = this.environmentProvider.read();
    const stableOnly = env.dependencyWatcherStableOnly;

    this.strategies = new Map<string, RegistryStrategy>([
      [DependencyEcosystem.Npm, new NpmRegistryStrategy(stableOnly)],
      [DependencyEcosystem.Pip, new PipRegistryStrategy(stableOnly)],
      [DependencyEcosystem.Composer, new ComposerRegistryStrategy(stableOnly)],
      [DependencyEcosystem.Maven, new MavenRegistryStrategy(stableOnly)],
      [DependencyEcosystem.Cargo, new CargoRegistryStrategy(stableOnly)],
    ]);
  }

  getStrategy(ecosystem: string): RegistryStrategy | undefined {
    return this.strategies.get(ecosystem);
  }
}
