import chalk from 'chalk';
import { existsSync, mkdirSync, cpSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { findClaude, pluginInstall, pluginUninstall, pluginStatus, getPackageRoot } from './plugin';
import { version } from '@core/version';

interface HarnessInfo {
  name: string;
  detected: boolean;
  path?: string;
  installedVersion?: string;
}

const HARNESSES = ['claude', 'codex', 'pi', 'opencode'] as const;
type HarnessName = typeof HARNESSES[number];

function whichExists(bin: string): boolean {
  try {
    execFileSync('which', [bin], { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '~';
}

function getPluginSourceDir(): string {
  return join(getPackageRoot(), 'plugins', 'mlld');
}

function detectHarness(name: HarnessName): HarnessInfo {
  const home = homeDir();
  switch (name) {
    case 'claude':
      return { name: 'Claude Code', detected: whichExists('claude') };
    case 'codex': {
      const dir = join(home, '.codex');
      return { name: 'Codex', detected: whichExists('codex') || existsSync(dir), path: dir };
    }
    case 'pi': {
      const dir = join(home, '.pi');
      return { name: 'Pi', detected: whichExists('pi') || existsSync(dir), path: dir };
    }
    case 'opencode': {
      const dir = join(home, '.config', 'opencode');
      return { name: 'OpenCode', detected: whichExists('opencode') || existsSync(dir), path: dir };
    }
  }
}

function detectAll(): HarnessInfo[] {
  return HARNESSES.map(h => detectHarness(h));
}

function getVersionMarkerPath(harness: HarnessInfo): string | null {
  if (harness.name === 'Claude Code') return null; // managed by plugin system
  if (!harness.path) return null;
  return join(harness.path, 'skills', 'mlld', '.version');
}

function readInstalledVersion(harness: HarnessInfo): string | null {
  const markerPath = getVersionMarkerPath(harness);
  if (!markerPath) return null;
  try {
    return readFileSync(markerPath, 'utf8').trim();
  } catch {
    return null;
  }
}

function copySkills(sourceDir: string, targetDir: string): void {
  const skillsSource = join(sourceDir, 'skills');
  const examplesSource = join(sourceDir, 'examples');
  const skillsTarget = join(targetDir, 'skills', 'mlld');

  mkdirSync(skillsTarget, { recursive: true });

  if (existsSync(skillsSource)) {
    cpSync(skillsSource, join(skillsTarget, 'skills'), { recursive: true });
  }
  if (existsSync(examplesSource)) {
    cpSync(examplesSource, join(skillsTarget, 'examples'), { recursive: true });
  }

  writeFileSync(join(skillsTarget, '.version'), version, 'utf8');
}

function removeSkills(targetDir: string): void {
  const skillsTarget = join(targetDir, 'skills', 'mlld');
  if (existsSync(skillsTarget)) {
    rmSync(skillsTarget, { recursive: true, force: true });
  }
}

async function installHarness(harness: HarnessInfo, sourceDir: string, scope: string, verbose?: boolean, local?: boolean): Promise<boolean> {
  switch (harness.name) {
    case 'Claude Code': {
      const claude = findClaude();
      if (!claude) {
        console.log(chalk.yellow('  Claude Code CLI not found, skipping'));
        return false;
      }
      await pluginInstall({ scope, verbose, local });
      return true;
    }
    case 'Codex': {
      if (!harness.path) return false;
      mkdirSync(harness.path, { recursive: true });
      copySkills(sourceDir, harness.path);
      console.log(chalk.green(`  Codex skills installed to ${harness.path}/skills/mlld/`));
      return true;
    }
    case 'Pi': {
      if (!harness.path) return false;
      const agentDir = join(harness.path, 'agent');
      mkdirSync(agentDir, { recursive: true });
      const skillsSource = join(sourceDir, 'skills');
      const examplesSource = join(sourceDir, 'examples');
      const target = join(agentDir, 'skills', 'mlld');
      mkdirSync(target, { recursive: true });
      if (existsSync(skillsSource)) {
        cpSync(skillsSource, join(target, 'skills'), { recursive: true });
      }
      if (existsSync(examplesSource)) {
        cpSync(examplesSource, join(target, 'examples'), { recursive: true });
      }
      writeFileSync(join(target, '.version'), version, 'utf8');
      console.log(chalk.green(`  Pi skills installed to ${agentDir}/skills/mlld/`));
      return true;
    }
    case 'OpenCode': {
      if (!harness.path) return false;
      mkdirSync(harness.path, { recursive: true });
      copySkills(sourceDir, harness.path);
      console.log(chalk.green(`  OpenCode skills installed to ${harness.path}/skills/mlld/`));
      return true;
    }
    default:
      return false;
  }
}

async function uninstallHarness(harness: HarnessInfo, verbose?: boolean): Promise<boolean> {
  switch (harness.name) {
    case 'Claude Code': {
      const claude = findClaude();
      if (!claude) {
        console.log(chalk.yellow('  Claude Code CLI not found, skipping'));
        return false;
      }
      await pluginUninstall(verbose);
      return true;
    }
    case 'Codex': {
      if (!harness.path) return false;
      removeSkills(harness.path);
      console.log(chalk.green('  Codex skills removed'));
      return true;
    }
    case 'Pi': {
      if (!harness.path) return false;
      const target = join(harness.path, 'agent', 'skills', 'mlld');
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
      }
      console.log(chalk.green('  Pi skills removed'));
      return true;
    }
    case 'OpenCode': {
      if (!harness.path) return false;
      removeSkills(harness.path);
      console.log(chalk.green('  OpenCode skills removed'));
      return true;
    }
    default:
      return false;
  }
}

async function skillInstall(target: string | undefined, scope: string, verbose?: boolean, local?: boolean): Promise<void> {
  const sourceDir = getPluginSourceDir();
  if (!existsSync(sourceDir)) {
    console.error(chalk.red(`Plugin source not found: ${sourceDir}`));
    process.exit(1);
  }

  const harnesses = target
    ? [detectHarness(target as HarnessName)].filter(h => h)
    : detectAll();

  const detected = harnesses.filter(h => h.detected);

  if (detected.length === 0) {
    console.log(chalk.yellow('No coding tools detected.'));
    console.log(chalk.gray('Supported: Claude Code, Codex, Pi, OpenCode'));
    return;
  }

  console.log(chalk.blue(`Installing mlld skills (v${version})...\n`));

  let installed = 0;
  for (const harness of detected) {
    console.log(chalk.bold(harness.name));
    const ok = await installHarness(harness, sourceDir, scope, verbose, local);
    if (ok) installed++;
    console.log();
  }

  if (installed > 0) {
    console.log(chalk.green(`Skills installed for ${installed} tool${installed !== 1 ? 's' : ''}.`));
  }
}

async function skillUninstall(target: string | undefined, verbose?: boolean): Promise<void> {
  const harnesses = target
    ? [detectHarness(target as HarnessName)].filter(h => h)
    : detectAll();

  const detected = harnesses.filter(h => h.detected);

  if (detected.length === 0) {
    console.log(chalk.yellow('No coding tools detected.'));
    return;
  }

  console.log(chalk.blue('Uninstalling mlld skills...\n'));

  for (const harness of detected) {
    console.log(chalk.bold(harness.name));
    await uninstallHarness(harness, verbose);
    console.log();
  }

  console.log(chalk.green('Done.'));
}

async function skillStatus(verbose?: boolean): Promise<void> {
  const harnesses = detectAll();
  const detected = harnesses.filter(h => h.detected);

  if (detected.length === 0) {
    console.log(chalk.yellow('No coding tools detected.'));
    console.log(chalk.gray('Supported: Claude Code, Codex, Pi, OpenCode'));
    return;
  }

  console.log(chalk.bold('mlld skill status\n'));

  for (const harness of detected) {
    const installed = readInstalledVersion(harness);
    if (harness.name === 'Claude Code') {
      // Delegate to plugin status
      await pluginStatus(verbose);
    } else if (installed) {
      const current = installed === version;
      const versionLabel = current
        ? chalk.green(installed)
        : `${chalk.yellow(installed)} → ${chalk.green(version)}`;
      console.log(`  ${harness.name}: ${versionLabel}`);
      if (!current) {
        console.log(chalk.gray(`    Run \`mlld skill install\` to update`));
      }
    } else {
      console.log(`  ${harness.name}: ${chalk.gray('not installed')}`);
    }
  }
}

function showUsage(): void {
  console.log(`
${chalk.bold('Usage:')}
  mlld skill install [--target <harness>]   Install skills to coding tools
  mlld skill uninstall [--target <harness>]  Remove skills from coding tools
  mlld skill status                          Check installation state

${chalk.bold('Options:')}
  --target <harness>  Target a specific tool: claude, codex, pi, opencode
  --scope <scope>     Claude Code scope: user or project (default: user)
  --local             Use local mlld directory as plugin source (for development)
  --verbose, -v       Show detailed output
  -h, --help          Show this help message

${chalk.bold('Examples:')}
  mlld skill install                      Install to all detected tools
  mlld skill install --local              Install from local directory
  mlld skill install --target codex       Install to Codex only
  mlld skill status                       Check what's installed
  mlld skill uninstall                    Remove from all tools
`);
}

export function createSkillCommand() {
  return {
    name: 'skill',
    description: 'Manage coding tool skills',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      if (flags.help || flags.h) {
        showUsage();
        return;
      }

      const subcommand = args[0];
      const verbose = flags.verbose || flags.v;
      const scope = flags.scope || 'user';
      const target = flags.target;
      const local = flags.local || false;

      switch (subcommand) {
        case 'install':
        case 'i':
          await skillInstall(target, scope, verbose, local);
          break;
        case 'uninstall':
        case 'remove':
          await skillUninstall(target, verbose);
          break;
        case 'status':
          await skillStatus(verbose);
          break;
        default:
          if (subcommand) {
            console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
          }
          showUsage();
          if (subcommand) process.exit(1);
          break;
      }
    }
  };
}
