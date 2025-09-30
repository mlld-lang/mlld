import chalk from 'chalk';
import * as path from 'path';
import { ModuleWorkspace } from '@core/registry';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { findProjectRoot } from '@core/utils/findProjectRoot';

export async function devCommand(args: string[], _flags: Record<string, any>) {
  const subcommand = args[0] || 'status';

  switch (subcommand) {
    case 'status':
      await showStatus();
      break;
    case 'list':
      await listLocalModules();
      break;
    default:
      console.log(chalk.red(`Unknown dev subcommand: ${subcommand}`));
      console.log(`\nAvailable subcommands:`);
      console.log(`  status - Show local module status`);
      console.log(`  list   - List local modules with their publish names`);
  }
}

async function resolveWorkspace(): Promise<{ workspace: ModuleWorkspace; projectRoot: string }> {
  const fileSystem = new NodeFileSystem();
  const projectRoot = await findProjectRoot(process.cwd(), fileSystem);
  const workspace = new ModuleWorkspace({ projectRoot });
  return { workspace, projectRoot };
}

async function loadLocalPrefixes(workspace: ModuleWorkspace) {
  const projectRoot = workspace.projectRoot;
  const relativePath = workspace.projectConfig?.getLocalModulesPath?.() ?? path.join('llm', 'modules');
  const localPath = path.isAbsolute(relativePath) ? relativePath : path.join(projectRoot, relativePath);

  let currentUser: string | undefined;
  try {
    const user = await GitHubAuthService.getInstance().getGitHubUser();
    currentUser = user?.login?.toLowerCase();
  } catch {
    currentUser = undefined;
  }

  const resolverPrefixes = workspace.projectConfig?.getResolverPrefixes() ?? [];
  const allowedAuthors = resolverPrefixes
    .filter(prefix => prefix.prefix && prefix.prefix.startsWith('@') && prefix.resolver !== 'REGISTRY')
    .map(prefix => prefix.prefix.replace(/^@/, '').replace(/\/$/, '').toLowerCase());

  await workspace.resolverManager.configureLocalModules(localPath, {
    currentUser,
    allowedAuthors
  });

  return {
    prefixes: workspace.resolverManager.getLocalPrefixes(),
    localPath,
    currentUser
  };
}

async function showStatus(): Promise<void> {
  const { workspace, projectRoot } = await resolveWorkspace();
  const { prefixes, localPath, currentUser } = await loadLocalPrefixes(workspace);

  console.log(`Project root: ${chalk.bold(projectRoot)}`);
  console.log(`Local module path: ${chalk.gray(localPath)}`);

  if (currentUser) {
    console.log(`Authenticated GitHub user: ${chalk.cyan('@' + currentUser)}`);
  } else {
    console.log(chalk.gray('Authenticated GitHub user: not detected (run "mlld auth login" to enable author matching)'));
  }

  if (prefixes.length === 0) {
    console.log(chalk.gray('\nNo accessible local modules were found.')); 
    console.log(chalk.gray('Add modules under llm/modules/ and include author metadata to enable local imports.'));
    return;
  }

  console.log('\nLocal modules detected:');
  for (const [author, modules] of prefixes) {
    for (const module of modules) {
      const modulePath = path.join('llm', 'modules', `${module}.mlld.md`);
      console.log(chalk.cyan(`  @${author}/${module}`) + ' → ' + chalk.gray(modulePath));
    }
  }

  console.log(`\nTotal authors: ${prefixes.length}`);
}

async function listLocalModules(): Promise<void> {
  const { workspace } = await resolveWorkspace();
  const { prefixes } = await loadLocalPrefixes(workspace);

  if (prefixes.length === 0) {
    console.log(chalk.gray('No accessible local modules found.'));
    return;
  }

  console.log('Local modules:');
  let total = 0;
  for (const [author, modules] of prefixes) {
    console.log(`\n${chalk.bold(author)}:`);
    for (const module of modules) {
      console.log(`  ${chalk.cyan(module)} → @${author}/${module}`);
      total++;
    }
  }

  console.log(chalk.gray(`\nTotal: ${total} module${total === 1 ? '' : 's'} from ${prefixes.length} author${prefixes.length === 1 ? '' : 's'}`));
}

export function createDevCommand() {
  return {
    name: 'dev',
    description: 'Inspect local module discovery',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld dev [subcommand]

Inspect local module discovery and status.

Subcommands:
  status    Show current detection status (default)
  list      List all local modules with their publish names

Local modules are available automatically when:
  • Their author matches your authenticated GitHub user
  • You have a resolver prefix configured for that author (e.g., private modules)

Use '/import local { helper } from @author/module' to force loading from llm/modules/.
        `);
        return;
      }

      await devCommand(args, flags);
    }
  };
}
