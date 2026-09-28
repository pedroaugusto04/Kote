#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

console.log('\n[Hook: Validação Determinística] Verificando modificações no projeto...');

// The hook is often launched by an editor from a subdirectory. Resolve every
// repository-relative command from this file instead of relying on cwd.
const hookDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(hookDirectory, '../..');

// Safety net: Timeout de 7 minutos
const TIMEOUT_MS = 7 * 60 * 1000;
setTimeout(() => {
  console.error('\n❌ [Hook: Timeout] A validação excedeu o tempo limite de 7 minutos e foi abortada.');
  process.exit(1);
}, TIMEOUT_MS).unref();

// 1. Obter arquivos modificados (git diff e status)
let changedFiles = [];
try {
  const diffOutput = execSync('git diff --name-only HEAD', { cwd: repositoryRoot, encoding: 'utf8' });
  const statusOutput = execSync('git status --porcelain', { cwd: repositoryRoot, encoding: 'utf8' });

  const filesFromDiff = diffOutput.split('\n').map(f => f.trim()).filter(Boolean);
  const filesFromStatus = statusOutput.split('\n')
    .map(line => line.slice(3).trim())
    .filter(Boolean);

  changedFiles = Array.from(new Set([...filesFromDiff, ...filesFromStatus]));
} catch (error) {
  console.warn('⚠️ Não foi possível obter alterações via Git. Rodando suíte completa por precaução...');
  changedFiles = ['package.json']; // Força validação completa em caso de falha no Git
}

if (changedFiles.length === 0) {
  console.log('✅ Nenhum arquivo modificado. Validação pulada.');
  process.exit(0);
}

console.log(`Arquivos modificados detectados: ${changedFiles.length}`);

// 2. Classificação de alterações
const hasPackageJsonChanges = changedFiles.some(f => f === 'package.json' || f === 'package-lock.json');
const hasPersistenceChanges = changedFiles.some(f => f.startsWith('backend/src/infrastructure/persistence/'));
const hasBackendChanges = changedFiles.some(f => f.startsWith('backend/') && !f.startsWith('backend/src/infrastructure/persistence/'));
const hasFrontendChanges = changedFiles.some(f => f.startsWith('frontend/'));
const hasCliChanges = changedFiles.some(f => f.startsWith('cli/'));

let failed = false;

// Helper para rodar comandos e retornar sucesso
function runCommand(cmd, args = [], env = {}) {
  console.log(`\n🏃 Executando: ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    cwd: repositoryRoot,
    env: { ...process.env, ...env }
  });
  if (result.error) {
    console.error(`❌ Não foi possível executar ${cmd}: ${result.error.message}`);
    return false;
  }
  if (result.signal) {
    console.error(`❌ ${cmd} foi encerrado pelo sinal ${result.signal}.`);
    return false;
  }
  return result.status === 0;
}

// Helper para rodar o linter de forma resiliente ao Node v18 local
function runLinter() {
  console.log('\n🔍 Executando: npm run lint');
  const lintResult = spawnSync('npm', ['run', 'lint'], { stdio: 'pipe', encoding: 'utf8' });
  if (lintResult.status !== 0) {
    const output = (lintResult.stdout || '') + (lintResult.stderr || '');
    if (output.includes('util.styleText is not a function')) {
      console.warn('\n⚠️  [ALERTA DE AMBIENTE]: Linter falhou devido à versão antiga do Node.js local.');
      console.warn('   O projeto requer Node.js >= 20.12.0.');
      console.warn(`   Sua versão atual: ${process.version}`);
      console.warn('   Ignorando esta falha específica de ambiente e continuando...\n');
      return true;
    } else {
      console.error('❌ Erros de Linter detectados no código:');
      console.error(output || `npm run lint terminou com código ${lintResult.status ?? 'desconhecido'}.`);
      return false;
    }
  }
  console.log('✅ Linter passou!');
  return true;
}

// 3. Execução das regras determinísticas
if (hasPackageJsonChanges) {
  console.log('\n[Regra: package.json] Alteração global de dependências detectada. Rodando validação completa...');

  if (!runLinter()) failed = true;

  if (!failed) {
    console.log('\nVerificando compilação (tsc) do Backend, Frontend e CLI...');
    const tscBackend = runCommand('npx', ['tsc', '--noEmit', '-p', 'backend/tsconfig.json']);
    const tscFrontend = runCommand('npx', ['tsc', '--noEmit', '-p', 'frontend/tsconfig.json']);
    const tscCli = runCommand('npx', ['tsc', '--noEmit', '-p', 'cli/tsconfig.json']);

    if (!tscBackend || !tscFrontend || !tscCli) {
      failed = true;
    }
  }

  if (!failed) {
    console.log('\nGerando build completo do projeto...');
    if (!runCommand('npm', ['run', 'build'])) failed = true;
  }

  if (!failed) {
    console.log('\n🧪 Executando suíte completa de testes (npm test)...');
    if (!runCommand('npm', ['run', 'test'])) failed = true;
  }

} else {
  // A. Alterações na camada de Persistência do Backend
  if (hasPersistenceChanges) {
    console.log('\n[Regra: Persistence] Alteração em persistência/banco detectada. Rodando suíte completa do Backend...');
    // Se mudou persistence, roda os testes de API (que cobrem banco e repositórios)
    if (!runCommand('npm', ['run', 'test:api'])) failed = true;
  }

  // B. Alterações gerais de Backend (excluindo persistence)
  if (!failed && hasBackendChanges) {
    console.log('\n[Regra: Backend] Alteração geral no Backend detectada...');

    console.log('1. Verificando tipos (tsc backend)...');
    const tsc = runCommand('npx', ['tsc', '--noEmit', '-p', 'backend/tsconfig.json']);

    let build = false;
    if (tsc) {
      console.log('2. Compilando código (build backend)...');
      build = runCommand('npm', ['run', 'build:api']);
    }

    if (build) {
      console.log('3. Executando testes (test backend)...');
      if (!runCommand('npm', ['run', 'test:api'])) failed = true;
    } else {
      failed = true;
    }
  }

  // C. Alterações no Frontend
  if (!failed && hasFrontendChanges) {
    console.log('\n[Regra: Frontend] Alteração no Frontend detectada...');

    if (!runLinter()) {
      failed = true;
    }

    if (!failed) {
      console.log('1. Verificando tipos (tsc frontend)...');
      if (!runCommand('npx', ['tsc', '--noEmit', '-p', 'frontend/tsconfig.json'])) failed = true;
    }

    if (!failed) {
      const frontendChanged = changedFiles.filter(f => f.startsWith('frontend/'));
      const testFiles = frontendChanged.filter(f => f.includes('.test.') || f.includes('.spec.'));
      console.log(`2. Executando testes Frontend...`);
      if (testFiles.length > 0) {
        const frontendTestFiles = testFiles.map((file) => path.relative(path.join(repositoryRoot, 'frontend'), path.join(repositoryRoot, file)));
        if (!runCommand('npx', ['vitest', 'run', '--config', 'frontend/vite.config.ts', ...frontendTestFiles])) failed = true;
      } else {
        if (!runCommand('npm', ['run', 'test:frontend'])) failed = true;
      }
    }
  }

  // D. Alterações na CLI
  if (!failed && hasCliChanges) {
    console.log('\n[Regra: CLI] Alteração na CLI detectada...');

    console.log('1. Verificando tipos (tsc cli)...');
    const tsc = runCommand('npx', ['tsc', '--noEmit', '-p', 'cli/tsconfig.json']);

    let build = false;
    if (tsc) {
      console.log('2. Compilando código (build cli)...');
      build = runCommand('npm', ['run', 'build:cli']);
    }

    if (build) {
      console.log('3. Executando testes (test cli)...');
      if (!runCommand('npm', ['run', 'test:cli'])) failed = true;
    } else {
      failed = true;
    }
  }
}

// 4. Conclusão do Hook
if (failed) {
  console.error('\n❌ [Hook: Falha] A validação falhou. Verifique os erros acima.');
  process.exit(1);
} else {
  console.log('\n✅ [Hook: Sucesso] Todas as checagens requeridas passaram!');
  process.exit(0);
}
