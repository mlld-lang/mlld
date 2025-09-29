import chalk from 'chalk';
import { ModuleInstaller, ModuleWorkspace, type ModuleSpecifier, type ModuleOutdatedResult } from '@core/registry';
import { renderDependencySummary } from '../utils/dependency-summary';
import { OutputFormatter, formatModuleReference } from '../utils/output';
import { getCommandContext } from '../utils/command-context';

export interface OutdatedOptions {
  verbose?: boolean;
  basePath?: string;
  format?: 'table' | 'list' | 'json';
}

class OutdatedCommand {
  private readonly workspace: ModuleWorkspace;
  private readonly installer: ModuleInstaller;

  constructor(projectRoot: string) {
    this.workspace = new ModuleWorkspace({ projectRoot });
    this.installer = new ModuleInstaller(this.workspace);
  }

  async check(args: string[], options: OutdatedOptions = {}): Promise<void> {
    const specs = this.resolveSpecs(args);
    const results = await this.installer.checkOutdated(specs);

    if (results.length === 0) {
      console.log(chalk.gray('No modules found in lock file.'));
      return;
    }

    if (options.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (options.format === 'list') {
      this.printList(results);
    } else {
      this.printTable(results);
    }

    this.printSummary(results);

    if (options.verbose) {
      const includeDev = options.includeDevDependencies ?? false;
      const resolution = await this.installer.resolveDependencies(specs, { includeDevDependencies: includeDev });
      await renderDependencySummary(this.workspace, specs, {
        verbose: options.verbose,
        includeDevDependencies: includeDev
      }, resolution);
    }
  }

  private resolveSpecs(args: string[]): ModuleSpecifier[] {
    if (args.length === 0) {
      return this.workspace.getModulesFromLockFile();
    }

    const specs: ModuleSpecifier[] = [];
    for (const ref of args) {
      try {
        const { username, moduleName, version } = formatModuleReference(ref);
        specs.push({ name: `@${username}/${moduleName}`, version });
      } catch (error) {
        console.warn((error as Error).message);
      }
    }
    return specs;
  }

  private printList(results: ModuleOutdatedResult[]): void {
    const sorted = [...results].sort((a, b) => a.module.localeCompare(b.module));
    for (const result of sorted) {
      if (result.status === 'outdated') {
        console.log(`${result.module}: ${result.currentVersion || 'unknown'} → ${result.latestVersion}`);
      } else if (result.status === 'up-to-date') {
        console.log(chalk.green(`${result.module}: up to date (${result.currentVersion || 'unknown'})`));
      } else {
        const reason = result.reason ? ` (${result.reason})` : '';
        console.log(chalk.gray(`${result.module}: unknown${reason}`));
      }
    }
  }

  private printTable(results: ModuleOutdatedResult[]): void {
    const headers = ['Module', 'Current', 'Latest', 'Status'];
    const rows = results
      .sort((a, b) => a.module.localeCompare(b.module))
      .map(result => {
        const statusText = this.statusText(result);
        return [
          result.module,
          result.currentVersion || '-',
          result.latestVersion || '-',
          statusText
        ];
      });

    console.log(OutputFormatter.formatTable(headers, rows));
  }

  private statusText(result: ModuleOutdatedResult): string {
    switch (result.status) {
      case 'outdated':
        return chalk.yellow('update available');
      case 'up-to-date':
        return chalk.green('up to date');
      default:
        return chalk.gray(result.reason || 'unknown');
    }
  }

  private printSummary(results: ModuleOutdatedResult[]): void {
    const outdated = results.filter(r => r.status === 'outdated').length;
    const upToDate = results.filter(r => r.status === 'up-to-date').length;
    const unknown = results.length - outdated - upToDate;

    const parts: string[] = [];
    parts.push(`${results.length} module${results.length !== 1 ? 's' : ''}`);
    if (outdated > 0) {
      parts.push(chalk.yellow(`${outdated} with updates`));
    }
    if (upToDate > 0) {
      parts.push(chalk.green(`${upToDate} up to date`));
    }
    if (unknown > 0) {
      parts.push(chalk.gray(`${unknown} unknown`));
    }

    console.log(parts.join(', '));
  }
}

export async function outdatedCommand(args: string[] = [], options: OutdatedOptions = {}): Promise<void> {
  const context = await getCommandContext({ startPath: options.basePath });
  const checker = new OutdatedCommand(context.projectRoot);
  await checker.check(args, options);
}

export function createOutdatedCommand() {
  return {
    name: 'outdated',
    description: 'Check for available updates to installed modules',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: OutdatedOptions = {
        verbose: flags.verbose || flags.v,
        basePath: flags['base-path'] || process.cwd(),
        format: flags.format,
        includeDevDependencies: flags.dev || flags['include-dev']
      };

      try {
        await outdatedCommand(args, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}
