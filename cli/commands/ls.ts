import chalk from 'chalk';
import { ModuleWorkspace } from '@core/registry';
import { OutputFormatter, type ModuleDisplayInfo } from '../utils/output';
import { getCommandContext } from '../utils/command-context';

export interface LsOptions {
  verbose?: boolean;
  lock?: boolean;
  cached?: boolean;
  missing?: boolean;
  basePath?: string;
  format?: 'table' | 'list' | 'json';
}

export class LsCommand {
  private readonly workspace: ModuleWorkspace;

  constructor(basePath: string) {
    this.workspace = new ModuleWorkspace({ projectRoot: basePath });
  }

  async list(options: LsOptions = {}): Promise<void> {
    if (options.cached) {
      console.log(chalk.gray('Listing cache status for locked modules...'));
    }
    await this.listLockedModules(options);
  }

  private async listLockedModules(options: LsOptions): Promise<void> {
    const modulesMap = this.workspace.lockFile.getAllModules();

    if (Object.keys(modulesMap).length === 0) {
      console.log(chalk.gray('No modules in lock file'));
      console.log(chalk.gray("Run 'mlld install @username/module' to install modules"));
      return;
    }

    const modules: ModuleDisplayInfo[] = [];

    for (const [moduleName, entry] of Object.entries(modulesMap)) {
      try {
        const cached = entry.resolved
          ? await this.workspace.moduleCache.has(entry.resolved)
          : false;
        const metadata = entry.resolved
          ? await this.workspace.moduleCache.getMetadata(entry.resolved)
          : null;

        modules.push({
          name: moduleName,
          hash: entry.resolved,
          size: metadata?.size,
          registry: this.extractRegistry(entry),
          cached,
          missing: !cached
        });
      } catch (error) {
        modules.push({
          name: moduleName,
          hash: entry.resolved,
          registry: this.extractRegistry(entry),
          cached: false,
          missing: true,
          error: (error as Error).message
        });
      }
    }

    let filteredModules = modules;
    if (options.missing) {
      filteredModules = modules.filter(m => m.missing);
    }

    filteredModules.sort((a, b) => a.name.localeCompare(b.name));

    if (options.format === 'json') {
      console.log(JSON.stringify(filteredModules, null, 2));
      return;
    }

    if (options.format === 'table') {
      this.outputAsTable(filteredModules, options);
    } else {
      this.outputAsList(filteredModules, options);
    }

    this.outputSummary(modules, options);
  }

  private outputAsList(modules: ModuleDisplayInfo[], options: LsOptions): void {
    if (modules.length === 0) {
      console.log(chalk.gray('No modules match the filter criteria'));
      return;
    }

    console.log(chalk.bold('Modules in mlld-lock.json:'));
    console.log(OutputFormatter.formatModuleList(modules, { verbose: options.verbose }));
  }

  private outputAsTable(modules: ModuleDisplayInfo[], options: LsOptions): void {
    if (modules.length === 0) {
      console.log(chalk.gray('No modules match the filter criteria'));
      return;
    }

    const headers = options.verbose
      ? ['Module', 'Hash', 'Status', 'Size', 'Source']
      : ['Module', 'Status', 'Size', 'Source'];

    const rows = modules.map(module => {
      const status = this.getStatusText(module);
      const size = module.size ? this.formatSize(module.size) : '-';
      const source = module.registry || '-';

      if (options.verbose) {
        const hash = module.hash ? module.hash.slice(0, 8) : '-';
        return [module.name, hash, status, size, source];
      }

      return [module.name, status, size, source];
    });

    console.log(OutputFormatter.formatTable(headers, rows));
  }

  private outputSummary(modules: ModuleDisplayInfo[], options: LsOptions): void {
    const total = modules.length;
    const cached = modules.filter(m => m.cached).length;
    const missing = modules.filter(m => m.missing).length;
    const errors = modules.filter(m => m.error).length;

    console.log('');

    if (total === 0) {
      return;
    }

    const parts: string[] = [];
    parts.push(`${total} module${total !== 1 ? 's' : ''}`);

    if (cached > 0) {
      parts.push(chalk.green(`${cached} cached`));
    }

    if (missing > 0) {
      parts.push(chalk.yellow(`${missing} missing`));
    }

    if (errors > 0) {
      parts.push(chalk.red(`${errors} error${errors !== 1 ? 's' : ''}`));
    }

    console.log(parts.join(', '));

    if (missing > 0 && !options.missing) {
      console.log(chalk.gray("Run 'mlld install' to fetch missing modules"));
    }
  }

  private extractRegistry(entry: ModuleLockEntry): string {
    const source = entry.sourceUrl ?? entry.source ?? '';
    if (source.startsWith('registry://')) {
      return 'registry';
    }
    if (source.includes('gist.githubusercontent.com')) {
      return 'gist';
    }
    if (source.includes('github.com')) {
      return 'github';
    }
    if (source.startsWith('https://')) {
      try {
        const url = new URL(source);
        return url.hostname;
      } catch {
        return 'remote';
      }
    }
    return 'local';
  }

  private getStatusText(module: ModuleDisplayInfo): string {
    if (module.error) {
      return chalk.red('error');
    }
    if (module.missing) {
      return chalk.yellow('missing');
    }
    if (module.cached) {
      return chalk.green('cached');
    }
    return chalk.gray('unknown');
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}b`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}kb`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
  }
}

export async function lsCommand(options: LsOptions = {}): Promise<void> {
  const context = await getCommandContext({ startPath: options.basePath });
  const lister = new LsCommand(context.projectRoot);
  await lister.list(options);
}

export function createLsCommand() {
  return {
    name: 'ls',
    aliases: ['list'],
    description: 'List modules recorded in the lock file',

    async execute(_args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: LsOptions = {
        verbose: flags.verbose || flags.v,
        lock: flags.lock,
        cached: flags.cached,
        missing: flags.missing,
        basePath: flags['base-path'] || process.cwd(),
        format: flags.format
      };

      try {
        await lsCommand(options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}
