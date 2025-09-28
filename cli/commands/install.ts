import chalk from 'chalk';
import { ModuleInstaller, ModuleWorkspace, type ModuleSpecifier, type ModuleInstallResult, type ModuleInstallerEvent, DependencyResolver, type DependencyResolution, formatVersionSpecifier } from '@core/registry';
import { ProgressIndicator } from '../utils/progress';
import { OutputFormatter, formatModuleReference, formatInstallTarget } from '../utils/output';
import { getCommandContext } from '../utils/command-context';

export interface InstallOptions {
  verbose?: boolean;
  noCache?: boolean;
  dryRun?: boolean;
  force?: boolean;
  basePath?: string;
}

export class InstallCommand {
  private readonly workspace: ModuleWorkspace;
  private readonly installer: ModuleInstaller;
  private readonly progress: ProgressIndicator;

  constructor(projectRoot: string, options: InstallOptions = {}) {
    this.workspace = new ModuleWorkspace({ projectRoot });
    this.installer = new ModuleInstaller(this.workspace);
    this.progress = new ProgressIndicator({
      style: 'emoji',
      verbose: options.verbose
    });
  }

  async install(modules: string[] = [], options: InstallOptions = {}): Promise<void> {
    if (modules.length > 0) {
      await this.installSpecificModules(modules, options);
    } else {
      await this.installFromConfig(options);
    }
  }

  private async installFromConfig(options: InstallOptions): Promise<void> {
    let specs = this.workspace.getDependenciesFromConfig();
    let sourceLabel = 'dependencies';

    if (specs.length === 0) {
      specs = this.workspace.getModulesFromLockFile();
      sourceLabel = 'lock file';
    }

    if (specs.length === 0) {
      this.progress.succeed('No modules to install');
      return;
    }

    this.progress.start(`Installing ${specs.length} module${specs.length !== 1 ? 's' : ''} from ${sourceLabel}`);
    const results = await this.runInstaller(specs, options);
    this.progress.finish();
    await this.report(results, options, specs);
  }

  private async installSpecificModules(modules: string[], options: InstallOptions): Promise<void> {
    const specs: ModuleSpecifier[] = [];

    for (const ref of modules) {
      try {
        const { username, moduleName, version } = formatModuleReference(ref);
        specs.push({
          name: `@${username}/${moduleName}`,
          version
        });
      } catch (error) {
        this.progress.warn((error as Error).message);
      }
    }

    if (specs.length === 0) {
      this.progress.succeed('No valid module references provided');
      return;
    }

    const label = specs.length === 1
      ? `Installing ${formatInstallTarget(modules[0])}`
      : `Installing ${specs.length} modules`;

    this.progress.start(label);
    const results = await this.runInstaller(specs, options);
    this.progress.finish();
    await this.report(results, options, specs);
  }

  private async runInstaller(specs: ModuleSpecifier[], options: InstallOptions): Promise<ModuleInstallResult[]> {
    return this.installer.installModules(specs, {
      force: options.force,
      noCache: options.noCache,
      dryRun: options.dryRun,
      context: 'import',
      onEvent: (event) => this.handleEvent(event, options)
    });
  }

  private handleEvent(event: ModuleInstallerEvent, options: InstallOptions): void {
    switch (event.type) {
      case 'start':
        this.progress.update(`Checking ${event.module}`);
        break;
      case 'fetch':
        this.progress.update(`Fetching ${event.module}`);
        break;
      case 'skip':
        if (event.reason === 'cached') {
          this.progress.info(`${event.module} (cached)`);
        } else if (options.dryRun) {
          this.progress.info(`${event.module} (dry run)`);
        }
        break;
      case 'success':
        if (event.status === 'installed') {
          const suffix = event.version ? ` (${event.version})` : '';
          this.progress.info(`Installed ${event.module}${suffix}`);
        } else if (event.status === 'cached') {
          this.progress.info(`${event.module} (cached)`);
        }
        break;
      case 'error':
        this.progress.warn(`Failed to install ${event.module}: ${event.error.message}`);
        break;
      default:
        break;
    }
  }
  private async report(
    results: ModuleInstallResult[],
    options: InstallOptions,
    specs: ModuleSpecifier[]
  ): Promise<void> {
    const installed = results.filter(r => r.status === 'installed').length;
    const cached = results.filter(r => r.status === 'cached').length;
    const failed = results.filter(r => r.status === 'failed').length;

    const summary = OutputFormatter.formatInstallSummary(installed, cached, failed);
    console.log(summary);

    if (results.some(r => r.status === 'failed') && options.verbose) {
      for (const result of results) {
        if (result.status === 'failed' && result.error) {
          console.error(result.error);
        }
      }
    }

    if (failed > 0) {
      console.log(chalk.yellow('\nSome modules failed to install. Use --verbose for details.'));
    }

    if (options.dryRun) {
      console.log(chalk.cyan('Dry run completed - no changes made'));
    } else if (installed > 0) {
      console.log(chalk.green('Lock file updated'));
    }

    if (specs.length > 0 && results.every(result => result.status !== 'failed')) {
      await this.renderDependencySummary(specs, options);
    }
  }

  private async renderDependencySummary(specs: ModuleSpecifier[], options: InstallOptions): Promise<void> {
    try {
      const resolver = new DependencyResolver(this.workspace.resolverManager, this.workspace.moduleCache);
      const resolution = await resolver.resolve(specs, { includeDevDependencies: false });
      this.printAggregatedNeeds(resolution, options);
    } catch (error) {
      if (options.verbose) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(`\nWarning: unable to analyze external dependencies (${message})`));
      }
    }
  }

  private printAggregatedNeeds(resolution: DependencyResolution, options: InstallOptions): void {
    const { aggregatedNeeds, conflicts } = resolution;
    const hasNeeds =
      aggregatedNeeds.runtimes.length > 0 ||
      aggregatedNeeds.tools.length > 0 ||
      aggregatedNeeds.packages.length > 0;

    if (!hasNeeds && conflicts.length === 0) {
      if (options.verbose) {
        console.log(chalk.gray('\nNo external runtimes, tools, or packages detected.'));
      }
      return;
    }

    console.log('\nExternal dependency summary:');

    if (aggregatedNeeds.runtimes.length > 0) {
      const runtimes = aggregatedNeeds.runtimes.map(req => req.raw || formatVersionSpecifier(req.name, req.specifier));
      console.log(`  Runtimes: ${runtimes.join(', ')}`);
    }

    if (aggregatedNeeds.tools.length > 0) {
      const tools = aggregatedNeeds.tools.map(req => req.raw || req.name);
      console.log(`  Tools: ${tools.join(', ')}`);
    }

    if (aggregatedNeeds.packages.length > 0) {
      console.log('  Packages:');
      for (const pkg of aggregatedNeeds.packages) {
        const sources = pkg.requests.map(req => req.module).join(', ');
        if (pkg.conflictMessage) {
          console.log(
            chalk.yellow(
              `    ! ${pkg.ecosystem}: ${pkg.name} — ${pkg.conflictMessage} (requested by ${sources})`
            )
          );
        } else if (pkg.resolved) {
          const resolved = pkg.resolved.raw || formatVersionSpecifier(pkg.resolved.name, pkg.resolved.specifier);
          console.log(`    - ${pkg.ecosystem}: ${pkg.name} → ${resolved} (requested by ${sources})`);
        } else {
          console.log(`    - ${pkg.ecosystem}: ${pkg.name} (requested by ${sources})`);
        }
      }
    }

    if (conflicts.length > 0) {
      console.log(chalk.red('  Conflicts detected:'));
      for (const conflict of conflicts) {
        const sources = conflict.requests.map(req => req.module).join(', ');
        console.log(chalk.red(`    • ${conflict.ecosystem}: ${conflict.name} — ${conflict.message} [${sources}]`));
      }
    }
  }
}

export async function installCommand(modules: string[], options: InstallOptions = {}): Promise<void> {
  const context = await getCommandContext({ startPath: options.basePath });
  const installer = new InstallCommand(context.projectRoot, options);
  await installer.install(modules, options);
}

export function createInstallCommand() {
  return {
    name: 'install',
    aliases: ['i'],
    description: 'Install mlld modules',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: InstallOptions = {
        verbose: flags.verbose || flags.v,
        noCache: flags['no-cache'],
        dryRun: flags['dry-run'],
        force: flags.force || flags.f,
        basePath: flags['base-path'] || process.cwd()
      };

      try {
        await installCommand(args, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}
