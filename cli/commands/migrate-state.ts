import { existsSync } from 'fs';
import { rename } from 'fs/promises';
import chalk from 'chalk';
import {
  legacyProjectStateDir,
  legacyUserStateDir,
  projectStateDir,
  userStateDir
} from '@core/paths/state-dirs';

interface MigrateStateOptions {
  dryRun?: boolean;
  basePath?: string;
  project?: boolean;
  user?: boolean;
}

interface MigrationPlan {
  from: string;
  to: string;
  scope: 'project' | 'user';
}

function collectPlans(options: MigrateStateOptions): { plans: MigrationPlan[]; skipped: string[] } {
  const plans: MigrationPlan[] = [];
  const skipped: string[] = [];
  const root = options.basePath ?? process.cwd();
  const both = !options.project && !options.user;
  const wantProject = both || Boolean(options.project);
  const wantUser = both || Boolean(options.user);

  if (wantProject) {
    const legacy = legacyProjectStateDir(root);
    const target = projectStateDir(root);
    if (existsSync(legacy)) {
      if (existsSync(target)) {
        skipped.push(`${legacy} → ${target} (target already exists)`);
      } else {
        plans.push({ from: legacy, to: target, scope: 'project' });
      }
    }
  }

  if (wantUser) {
    const legacy = legacyUserStateDir();
    const target = userStateDir();
    if (existsSync(legacy)) {
      if (existsSync(target)) {
        skipped.push(`${legacy} → ${target} (target already exists)`);
      } else {
        plans.push({ from: legacy, to: target, scope: 'user' });
      }
    }
  }

  return { plans, skipped };
}

export async function migrateStateCommand(options: MigrateStateOptions = {}): Promise<void> {
  const { plans, skipped } = collectPlans(options);

  if (plans.length === 0 && skipped.length === 0) {
    console.log('Nothing to migrate: no legacy .mlld/ state directories found.');
    return;
  }

  if (plans.length > 0) {
    console.log(options.dryRun ? 'Would rename:' : 'Renaming:');
    for (const plan of plans) {
      console.log(`  ${plan.from} → ${plan.to}`);
    }
  }

  if (skipped.length > 0) {
    console.log(chalk.yellow('\nSkipped (target already exists):'));
    for (const entry of skipped) {
      console.log(`  ${entry}`);
    }
    console.log(
      chalk.yellow(
        '\nThe target is where mlld now writes. Merge or remove the legacy directory manually if needed.'
      )
    );
  }

  if (options.dryRun) {
    return;
  }

  for (const plan of plans) {
    await rename(plan.from, plan.to);
    console.log(chalk.green(`✓ ${plan.scope} state migrated`));
  }

  if (plans.length > 0) {
    console.log(chalk.green(`\nDone. ${plans.length} director${plans.length === 1 ? 'y' : 'ies'} renamed.`));
  }
}

export function createMigrateStateCommand() {
  return {
    name: 'migrate-state',
    description: 'Rename legacy .mlld/ state directories to .llm/ (project and user)',

    async execute(args: string[], flags: Record<string, unknown> = {}): Promise<void> {
      const options: MigrateStateOptions = {
        dryRun: Boolean(flags['dry-run'] ?? flags.n),
        basePath: typeof flags['base-path'] === 'string' ? (flags['base-path'] as string) : undefined,
        project: Boolean(flags.project),
        user: Boolean(flags.user)
      };

      try {
        await migrateStateCommand(options);
      } catch (error) {
        console.error(
          chalk.red(
            `migrate-state failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
        process.exit(1);
      }
    }
  };
}
