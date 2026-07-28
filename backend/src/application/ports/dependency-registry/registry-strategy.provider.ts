import { Injectable } from '@nestjs/common';

import { DependencyEcosystem } from '../../../contracts/enums.js';
import { CargoRegistryStrategy } from './cargo-registry.strategy.js';
import { ComposerRegistryStrategy } from './composer-registry.strategy.js';
import { MavenRegistryStrategy } from './maven-registry.strategy.js';
import { NpmRegistryStrategy } from './npm-registry.strategy.js';
import { PipRegistryStrategy } from './pip-registry.strategy.js';
import { RegistryStrategy } from './registry-strategy.interface.js';

@Injectable()
export class RegistryStrategyProvider {
  private readonly strategies = new Map<string, RegistryStrategy>([
    [DependencyEcosystem.Npm, new NpmRegistryStrategy()],
    [DependencyEcosystem.Pip, new PipRegistryStrategy()],
    [DependencyEcosystem.Composer, new ComposerRegistryStrategy()],
    [DependencyEcosystem.Maven, new MavenRegistryStrategy()],
    [DependencyEcosystem.Cargo, new CargoRegistryStrategy()],
  ]);

  getStrategy(ecosystem: string): RegistryStrategy | undefined {
    return this.strategies.get(ecosystem);
  }
}
