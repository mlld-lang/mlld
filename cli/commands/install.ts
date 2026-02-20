import chalk from 'chalk';
import { spawn } from 'child_process';
import { ModuleInstaller, ModuleWorkspace, type ModuleSpecifier, type ModuleInstallResult, type ModuleInstallerEvent } from '@core/registry';
import { renderDependencySummary } from '../utils/dependency-summary';
import { ProgressIndicator } from '../utils/progress';
import { OutputFormatter, formatModuleReference, formatInstallTarget } from '../utils/output';
import { getCommandContext } from '../utils/command-context';

export interface InstallOptions {
  verbose?: boolean;
  noCache?: boolean;
  dryRun?: boolean;
  force?: boolean;
  basePath?: string;
  global?: boolean;
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
      global: options.global,
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
      case 'directory-install':
        this.progress.info(`Installed ${event.module} to ${event.targetDir} (${event.fileCount} files)`);
        break;
      case 'error':
        this.progress.warn(`Failed to install ${event.module}: ${event.error.message}`);
        break;
      default:
        break;
    }
  }

  private async maybeRunNodePackageManager(
    results: ModuleInstallResult[],
    options: InstallOptions
  ): Promise<void> {
    if (options.dryRun || options.global) {
      return;
    }
    if (results.some(result => result.status === 'failed')) {
      return;
    }
    const installed = results.some(result => result.status === 'installed');
    if (!installed) {
      return;
    }
    const manager = this.workspace.projectConfig.getNodePackageManager();
    if (!manager) {
      return;
    }
    const trimmed = manager.trim();
    if (!trimmed) {
      return;
    }
    const command = /\s/.test(trimmed) ? trimmed : `${trimmed} install`;
    console.log(chalk.cyan(`Running ${command}`));
    await this.runNodePackageManager(command);
    console.log(chalk.green(`Finished ${command}`));
  }

  private async runNodePackageManager(command: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, {
        cwd: this.workspace.projectRoot,
        stdio: 'inherit',
        shell: true
      });
      child.on('error', reject);
      child.on('exit', code => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Command failed with exit code ${code ?? 'unknown'}`));
      });
    });
  }
  private async report(
    results: ModuleInstallResult[],
    options: InstallOptions,
    specs: ModuleSpecifier[]
  ): Promise<void> {
    this.reportDirectInstallGuidance(results, options);

    const installed = results.filter(r => r.status === 'installed').length;
    const cached = results.filter(r => r.status === 'cached').length;
    const failed = results.filter(r => r.status === 'failed').length;

    const directInstalled = results.filter(r => r.status === 'installed' && r.isDirect).length;
    const transitiveInstalled = results.filter(r => r.status === 'installed' && !r.isDirect).length;

    const summary = OutputFormatter.formatInstallSummary(installed, cached, failed, {
      directInstalled,
      transitiveInstalled
    });
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
      try {
        const resolution = await this.installer.resolveDependencies(specs, { includeDevDependencies: false });
        await renderDependencySummary(this.workspace, specs, {
          verbose: options.verbose,
          includeDevDependencies: false
        }, resolution);
      } catch (error) {
        if (options.verbose) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(chalk.yellow(`\nWarning: unable to analyze external dependencies (${message})`));
        }
      }
    }

    await this.maybeRunNodePackageManager(results, options);
  }

  private reportDirectInstallGuidance(results: ModuleInstallResult[], options: InstallOptions): void {
    if (options.dryRun) {
      return;
    }

    const directInstalled = results.filter(
      result =>
        result.isDirect &&
        (result.status === 'installed' || result.status === 'cached')
    );
    const seen = new Set<string>();

    for (const result of directInstalled) {
      if (seen.has(result.module)) {
        continue;
      }
      seen.add(result.module);

      const versionSuffix = result.version ? `@${result.version}` : '';
      const cacheSuffix = result.status === 'cached' ? ' (cached)' : '';
      console.log(chalk.green(`${result.module}${versionSuffix} installed${cacheSuffix}`));
      console.log(chalk.gray(`  import "${result.module}" as @${this.suggestImportAlias(result.module)}`));
    }
  }

  private suggestImportAlias(moduleName: string): string {
    const localName = moduleName.replace(/^@[^/]+\//, '');
    const parts = localName.split(/[^a-zA-Z0-9]+/).filter(Boolean);

    if (parts.length === 0) {
      return 'module';
    }

    const normalizedParts = parts.map(part => part.toLowerCase());
    let alias = normalizedParts.length > 1
      ? normalizedParts.map(part => part[0]).join('')
      : normalizedParts[0];

    if (!alias || alias.length === 0) {
      alias = 'module';
    }

    if (/^\d/.test(alias)) {
      alias = `m${alias}`;
    }

    return alias;
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
      const redirects: Record<string, string> = {
        'plugin': 'mlld plugin install',
        'skill': 'mlld skill install',
        'skills': 'mlld skill install',
      };
      for (const arg of args) {
        const redirect = redirects[arg.toLowerCase()];
        if (redirect) {
          console.log(chalk.yellow(`"${arg}" is not a module. Did you mean \`${redirect}\`?`));
          return;
        }
      }

      const options: InstallOptions = {
        verbose: flags.verbose || flags.v,
        noCache: flags['no-cache'],
        dryRun: flags['dry-run'],
        force: flags.force || flags.f,
        basePath: flags['base-path'] || process.cwd(),
        global: flags.global || flags.g
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
