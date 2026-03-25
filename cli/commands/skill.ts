import chalk from 'chalk';
import { existsSync, mkdirSync, cpSync, writeFileSync, rmSync, readFileSync, readdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';
import { findClaude, pluginInstall, pluginUninstall, pluginStatus, getPackageRoot } from './plugin';
import { version } from '@core/version';
import { RegistryResolver } from '@core/resolvers/RegistryResolver';

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

const REGISTRY_REF_PATTERN = /^@[a-z0-9-]+\/[a-z0-9-]+(@.+)?$/;

function isRegistryRef(ref: string | undefined): boolean {
  return !!ref && REGISTRY_REF_PATTERN.test(ref);
}

function parseSkillName(moduleRef: string): string {
  return moduleRef.replace(/^@[^/]+\//, '').replace(/@.*$/, '');
}

function getSkillDir(harness: HarnessInfo, skillName: string): string | null {
  switch (harness.name) {
    case 'Claude Code':
      return join(homeDir(), '.claude', 'skills', skillName);
    case 'Pi':
      return harness.path ? join(harness.path, 'agent', 'skills', skillName) : null;
    default:
      return harness.path ? join(harness.path, 'skills', skillName) : null;
  }
}

function writeFilesTo(dir: string, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(dir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
  }
}

function writeVersionMarker(dir: string, ver: string): void {
  writeFileSync(join(dir, '.version'), ver, 'utf8');
}

function readSkillVersion(dir: string): string | null {
  try {
    return readFileSync(join(dir, '.version'), 'utf8').trim();
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

function fixSkillNamesForPi(dir: string): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const content = readFileSync(skillFile, 'utf8');
    const fixed = content.replace(/^(name:\s*)mlld:/m, `$1mlld-`);
    if (fixed !== content) {
      writeFileSync(skillFile, fixed, 'utf8');
    }
    renameSync(join(dir, entry.name), join(dir, `mlld-${entry.name}`));
  }
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
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
      }
      mkdirSync(target, { recursive: true });
      if (existsSync(skillsSource)) {
        cpSync(skillsSource, join(target, 'skills'), { recursive: true });
      }
      if (existsSync(examplesSource)) {
        cpSync(examplesSource, join(target, 'examples'), { recursive: true });
      }
      fixSkillNamesForPi(join(target, 'skills'));
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

async function installRegistrySkill(
  harness: HarnessInfo, skillName: string,
  files: Record<string, string>, ver: string
): Promise<boolean> {
  const skillDir = getSkillDir(harness, skillName);
  if (!skillDir) return false;

  writeFilesTo(skillDir, files);
  writeVersionMarker(skillDir, ver);
  console.log(chalk.green(`  Installed to ${skillDir}/`));
  return true;
}

async function skillInstallFromRegistry(
  moduleRef: string, target: string | undefined, scope: string, verbose?: boolean
): Promise<void> {
  const resolver = new RegistryResolver();

  if (!resolver.canResolve(moduleRef)) {
    console.error(chalk.red(`Invalid module reference: ${moduleRef}`));
    console.error(chalk.gray('Expected format: @author/skill-name'));
    process.exit(1);
  }

  console.log(chalk.blue(`Resolving ${moduleRef} from registry...`));

  let resolution;
  try {
    resolution = await resolver.resolve(moduleRef);
  } catch (error: any) {
    console.error(chalk.red(`Failed to resolve ${moduleRef}: ${error.message}`));
    process.exit(1);
  }

  const metadata = resolution.metadata ?? {};

  if (!metadata.isDirectory || metadata.moduleType !== 'skill') {
    const actualType = metadata.moduleType || 'library';
    console.error(chalk.red(`${moduleRef} is not a skill module (type: ${actualType})`));
    process.exit(1);
  }

  const files = metadata.directoryFiles as Record<string, string>;
  const ver = (metadata.version as string) || 'unknown';
  const skillName = parseSkillName(moduleRef);

  const harnesses = target
    ? [detectHarness(target as HarnessName)].filter(h => h)
    : detectAll();
  const detected = harnesses.filter(h => h.detected);

  if (detected.length === 0) {
    console.log(chalk.yellow('No coding tools detected.'));
    console.log(chalk.gray('Supported: Claude Code, Codex, Pi, OpenCode'));
    return;
  }

  console.log(chalk.blue(`Installing ${moduleRef} (v${ver})...\n`));

  let installed = 0;
  for (const harness of detected) {
    console.log(chalk.bold(harness.name));
    const ok = await installRegistrySkill(harness, skillName, files, ver);
    if (ok) installed++;
    console.log();
  }

  if (installed > 0) {
    console.log(chalk.green(`${moduleRef} installed for ${installed} tool${installed !== 1 ? 's' : ''}.`));
  }
}

async function skillUninstallRegistry(
  moduleRef: string, target: string | undefined, verbose?: boolean
): Promise<void> {
  const skillName = parseSkillName(moduleRef);

  const harnesses = target
    ? [detectHarness(target as HarnessName)].filter(h => h)
    : detectAll();
  const detected = harnesses.filter(h => h.detected);

  if (detected.length === 0) {
    console.log(chalk.yellow('No coding tools detected.'));
    return;
  }

  console.log(chalk.blue(`Uninstalling ${moduleRef}...\n`));

  for (const harness of detected) {
    const skillDir = getSkillDir(harness, skillName);
    if (skillDir && existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true, force: true });
      console.log(chalk.green(`  Removed ${skillName} from ${harness.name}`));
    } else {
      console.log(chalk.gray(`  ${harness.name}: not installed`));
    }
  }

  console.log(chalk.green('\nDone.'));
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

function listRegistrySkills(harness: HarnessInfo): { name: string; version: string }[] {
  const results: { name: string; version: string }[] = [];
  let skillsBase: string | null = null;

  switch (harness.name) {
    case 'Claude Code':
      skillsBase = join(homeDir(), '.claude', 'skills');
      break;
    case 'Pi':
      if (harness.path) skillsBase = join(harness.path, 'agent', 'skills');
      break;
    default:
      if (harness.path) skillsBase = join(harness.path, 'skills');
      break;
  }

  if (!skillsBase || !existsSync(skillsBase)) return results;

  try {
    const entries = readdirSync(skillsBase, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'mlld') continue;
      const ver = readSkillVersion(join(skillsBase, entry.name));
      if (ver) {
        results.push({ name: entry.name, version: ver });
      }
    }
  } catch { /* ignore read errors */ }

  return results;
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

    const registrySkills = listRegistrySkills(harness);
    for (const skill of registrySkills) {
      console.log(`  ${harness.name}/${skill.name}: ${chalk.green(skill.version)}`);
    }
  }
}

function showUsage(): void {
  console.log(`
${chalk.bold('Usage:')}
  mlld skill install                           Install built-in mlld skills
  mlld skill install @author/skill-name        Install a skill from the registry
  mlld skill uninstall                         Remove built-in mlld skills
  mlld skill uninstall @author/skill-name      Remove a registry skill
  mlld skill status                            Check installation state

${chalk.bold('Options:')}
  --target <harness>  Target a specific tool: claude, codex, pi, opencode
  --scope <scope>     Claude Code scope: user or project (default: user)
  --local             Use local mlld directory as plugin source (for development)
  --verbose, -v       Show detailed output
  -h, --help          Show this help message

${chalk.bold('Examples:')}
  mlld skill install                      Install built-in skills to all tools
  mlld skill install @alice/my-helper     Install a registry skill
  mlld skill install --local              Install from local directory
  mlld skill install --target codex       Install to Codex only
  mlld skill status                       Check what's installed
  mlld skill uninstall                    Remove built-in skills from all tools
  mlld skill uninstall @alice/my-helper   Remove a registry skill
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
      const moduleRef = args[1];
      const verbose = flags.verbose || flags.v;
      const scope = flags.scope || 'user';
      const target = flags.target;
      const local = flags.local || false;

      switch (subcommand) {
        case 'install':
        case 'i':
          if (isRegistryRef(moduleRef)) {
            await skillInstallFromRegistry(moduleRef!, target, scope, verbose);
          } else {
            await skillInstall(target, scope, verbose, local);
          }
          break;
        case 'uninstall':
        case 'remove':
          if (isRegistryRef(moduleRef)) {
            await skillUninstallRegistry(moduleRef!, target, verbose);
          } else {
            await skillUninstall(target, verbose);
          }
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
