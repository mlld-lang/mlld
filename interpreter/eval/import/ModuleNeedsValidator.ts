import type { NeedsDeclaration, CommandNeeds } from '@core/policy/needs';
import { MlldImportError } from '@core/errors';
import type { Environment } from '../../env/Environment';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import * as path from 'path';

type UnmetNeed = {
  capability: string;
  value?: string;
  reason: string;
};

export class ModuleNeedsValidator {
  constructor(private readonly env: Environment) {}

  enforceModuleNeeds(needs: NeedsDeclaration | undefined, source?: string): void {
    if (!needs) {
      return;
    }

    const unmet = this.findUnmetNeeds(needs);
    if (unmet.length === 0) {
      return;
    }

    const detailLines = unmet.map(entry => {
      const valueSegment = entry.value ? ` '${entry.value}'` : '';
      return `- ${entry.capability}${valueSegment}: ${entry.reason}`;
    });
    const label = source ?? 'import';
    const message = `Import needs not satisfied for ${label}:\n${detailLines.join('\n')}`;

    throw new MlldImportError(message, {
      code: 'NEEDS_UNMET',
      details: {
        source: label,
        unmet,
        needs
      }
    });
  }

  findUnmetNeeds(needs: NeedsDeclaration): UnmetNeed[] {
    const unmet: UnmetNeed[] = [];

    if (needs.sh && !this.isCommandAvailable('sh')) {
      unmet.push({ capability: 'sh', reason: 'shell executable not available (sh)' });
    }

    if (needs.cmd) {
      for (const cmd of this.collectCommandNames(needs.cmd)) {
        if (!this.isCommandAvailable(cmd)) {
          unmet.push({ capability: 'cmd', value: cmd, reason: 'command not found in PATH' });
        }
      }
    }

    if (needs.packages) {
      const basePath = this.env.getBasePath ? this.env.getBasePath() : process.cwd();
      const moduleDir = this.env.getCurrentFilePath ? path.dirname(this.env.getCurrentFilePath() ?? basePath) : basePath;
      for (const [ecosystem, packages] of Object.entries(needs.packages)) {
        if (!Array.isArray(packages)) {
          continue;
        }
        switch (ecosystem) {
          case 'node':
            for (const pkg of packages) {
              if (!this.isNodePackageAvailable(pkg.name, moduleDir)) {
                unmet.push({ capability: 'node', value: pkg.name, reason: 'package not installed' });
              }
            }
            break;
          case 'python':
          case 'py':
            if (!this.isRuntimeAvailable(['python', 'python3'])) {
              unmet.push({ capability: 'python', reason: 'python runtime not available' });
            }
            break;
          case 'ruby':
          case 'rb':
            if (!this.isRuntimeAvailable(['ruby'])) {
              unmet.push({ capability: 'ruby', reason: 'ruby runtime not available' });
            }
            break;
          case 'go':
            if (!this.isRuntimeAvailable(['go'])) {
              unmet.push({ capability: 'go', reason: 'go runtime not available' });
            }
            break;
          case 'rust':
            if (!this.isRuntimeAvailable(['cargo', 'rustc'])) {
              unmet.push({ capability: 'rust', reason: 'rust toolchain not available' });
            }
            break;
          default:
            break;
        }
      }
    }

    return unmet;
  }

  private collectCommandNames(cmdNeeds: CommandNeeds): string[] {
    if (cmdNeeds.type === 'all') {
      return [];
    }
    if (cmdNeeds.type === 'list') {
      return cmdNeeds.commands;
    }
    return Object.keys(cmdNeeds.entries ?? {});
  }

  private isCommandAvailable(command: string): boolean {
    if (!command || typeof command !== 'string') {
      return false;
    }

    const binary = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(binary, [command], {
      stdio: 'ignore'
    });
    return result.status === 0;
  }

  private isRuntimeAvailable(candidates: string[]): boolean {
    return candidates.some(cmd => this.isCommandAvailable(cmd));
  }

  private isNodePackageAvailable(name: string, basePath: string): boolean {
    try {
      const esmRequire = createRequire(import.meta.url);
      esmRequire.resolve(name, { paths: [basePath] });
      return true;
    } catch {
      return false;
    }
  }
}
