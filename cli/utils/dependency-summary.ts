import chalk from 'chalk';
import {
  DependencyResolver,
  formatVersionSpecifier,
  type DependencyResolution,
  type ModuleSpecifier,
  type ModuleWorkspace
} from '@core/registry';

export interface DependencySummaryOptions {
  verbose?: boolean;
  includeDevDependencies?: boolean;
  header?: string;
}

export async function renderDependencySummary(
  workspace: ModuleWorkspace,
  specs: ModuleSpecifier[],
  options: DependencySummaryOptions = {}
): Promise<void> {
  if (specs.length === 0) {
    return;
  }

  try {
    const resolver = new DependencyResolver(workspace.resolverManager, workspace.moduleCache);
    const resolution = await resolver.resolve(specs, {
      includeDevDependencies: options.includeDevDependencies ?? false
    });
    printAggregatedNeeds(resolution, options);
  } catch (error) {
    if (options.verbose) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`\nWarning: unable to analyze external dependencies (${message})`));
    }
  }
}

export function printAggregatedNeeds(
  resolution: DependencyResolution,
  options: DependencySummaryOptions = {}
): void {
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

  const header = options.header ?? '\nExternal dependency summary:';
  console.log(header);

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
