import chalk from 'chalk';
import { ModuleInstaller, ModuleWorkspace, type ModuleSpecifier, type ModuleUpdateResult } from '@core/registry';
import { renderDependencySummary } from '../utils/dependency-summary';
import { ProgressIndicator } from '../utils/progress';
import { OutputFormatter, formatModuleReference } from '../utils/output';
import { getCommandContext } from '../utils/command-context';

export interface UpdateOptions {
  verbose?: boolean;
  basePath?: string;
  dryRun?: boolean;
  includeDevDependencies?: boolean;
}

class UpdateCommand {
  private readonly workspace: ModuleWorkspace;
  private readonly installer: ModuleInstaller;
  private readonly progress: ProgressIndicator;

  constructor(projectRoot: string, options: UpdateOptions = {}) {
    this.workspace = new ModuleWorkspace({ projectRoot });
    this.installer = new ModuleInstaller(this.workspace);
    this.progress = new ProgressIndicator({
      style: 'emoji',
      verbose: options.verbose
    });
  }

  async update(args: string[], options: UpdateOptions = {}): Promise<void> {
    const specs = this.resolveSpecs(args);

    if (options.dryRun) {
      await this.previewUpdates(specs);
      return;
    }

    if (specs.length === 0) {
      console.log(chalk.gray('No modules found to update'));
      return;
    }

    this.progress.start(`Updating ${specs.length} module${specs.length !== 1 ? 's' : ''}`);

    const results: ModuleUpdateResult[] = [];
    for (const spec of specs) {
      this.progress.update(`Updating ${spec.name}`);
      const [result] = await this.installer.updateModules([spec], {
        onEvent: (event) => {
          if (event.type === 'error') {
            this.progress.warn(`Failed to update ${event.module}: ${event.error.message}`);
          }
        }
      });
      results.push(result);

      if (result.status === 'updated') {
        const change = result.newVersion && result.previousVersion
          ? `${result.previousVersion} → ${result.newVersion}`
          : 'updated';
        this.progress.info(`${spec.name} ${change}`);
      } else if (result.status === 'unchanged') {
        this.progress.info(`${spec.name} already up to date`);
      }
    }

    this.progress.finish();
    await this.report(results, options, specs);
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
        this.progress.warn((error as Error).message);
      }
    }
    return specs;
  }

  private async previewUpdates(specs: ModuleSpecifier[]): Promise<void> {
    const results = await this.installer.checkOutdated(specs);

    if (results.length === 0) {
      console.log(chalk.gray('No modules found to update'));
      return;
    }

    const outdated = results.filter(r => r.status === 'outdated');

    if (outdated.length === 0) {
      console.log(chalk.green('All modules are up to date.'));
      return;
    }

    console.log(chalk.bold('Modules with available updates:'));
    for (const result of outdated) {
      console.log(`  ${result.module}: ${result.currentVersion || 'unknown'} → ${result.latestVersion}`);
    }

  private async report(
    results: ModuleUpdateResult[],
    options: UpdateOptions,
    specs: ModuleSpecifier[]
  ): Promise<void> {
    const updated = results.filter(r => r.status === 'updated');
    const unchanged = results.filter(r => r.status === 'unchanged');
    const failed = results.filter(r => r.status === 'failed');

    const parts: string[] = [];
    if (updated.length > 0) {
      parts.push(`${updated.length} module${updated.length !== 1 ? 's' : ''} updated`);
    }
    if (unchanged.length > 0) {
      parts.push(chalk.gray(`${unchanged.length} already latest`));
    }
    if (failed.length > 0) {
      parts.push(chalk.red(`${failed.length} failed`));
    }

    if (parts.length === 0) {
      console.log(chalk.gray('No modules were updated.'));
    } else {
      console.log(parts.join(', '));
    }

    if (failed.length > 0 && options.verbose) {
      for (const failure of failed) {
        if (failure.error) {
          console.error(failure.error);
        }
      }
    }

    const succeeded = results.filter(r => r.status !== 'failed').length;
    if (specs.length > 0 && succeeded > 0) {
      const includeDev = options.includeDevDependencies ?? false;
      const resolution = await this.installer.resolveDependencies(specs, { includeDevDependencies: includeDev });
      await renderDependencySummary(this.workspace, specs, {
        verbose: options.verbose,
        includeDevDependencies: includeDev
      }, resolution);
    }
  }
}

export async function updateCommand(args: string[], options: UpdateOptions = {}): Promise<void> {
  const context = await getCommandContext({ startPath: options.basePath });
  const updater = new UpdateCommand(context.projectRoot, options);
  await updater.update(args, options);
}

export function createUpdateCommand() {
  return {
    name: 'update',
    description: 'Update installed modules to their latest versions',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: UpdateOptions = {
        verbose: flags.verbose || flags.v,
        basePath: flags['base-path'] || process.cwd(),
        dryRun: flags['dry-run'],
        includeDevDependencies: flags.dev || flags['include-dev']
      };

      try {
        await updateCommand(args, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}
