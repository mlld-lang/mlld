import path from 'node:path';
import { glob } from 'tinyglobby';
import { resolveUserIdentity, SigService } from '@core/security';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { getCommandContext } from '../utils/command-context';

export interface SignOptions {
  basePath?: string;
  patterns?: string[];
  identity?: string;
}

function normalizePatterns(patterns: string[]): string[] {
  return patterns.map((pattern) => pattern.trim()).filter(Boolean);
}

function isGlobPattern(value: string): boolean {
  return /[*?[\]{}()]/.test(value);
}

async function resolvePatternTargets(
  patterns: string[],
  basePath: string | undefined
): Promise<string[]> {
  const context = await getCommandContext({ startPath: basePath });
  const fileSystem = new NodeFileSystem();
  const targets = new Set<string>();

  for (const rawPattern of patterns) {
    if (!isGlobPattern(rawPattern)) {
      const fromCwd = path.resolve(context.currentDir, rawPattern);
      const fromRoot = path.resolve(context.projectRoot, rawPattern);
      const resolvedPath = await fileSystem.exists(fromCwd).catch(() => false) ? fromCwd : fromRoot;
      if (await fileSystem.exists(resolvedPath).catch(() => false)) {
        const stat = await fileSystem.stat(resolvedPath).catch(() => null);
        if (stat?.isFile()) {
          targets.add(path.resolve(resolvedPath));
        }
      }
      continue;
    }

    let cwd = context.currentDir;
    let pattern = rawPattern;
    if (rawPattern.startsWith('@root/') || rawPattern.startsWith('@base/')) {
      cwd = context.projectRoot;
      pattern = rawPattern.replace(/^@(root|base)\//, '');
    }

    const matches = await glob(pattern, {
      cwd,
      absolute: true,
      dot: true,
      onlyFiles: true
    });
    for (const match of matches) {
      targets.add(path.resolve(match));
    }
  }

  return Array.from(targets).sort();
}

export async function signCommand(options: SignOptions = {}): Promise<void> {
  const patterns = normalizePatterns(options.patterns ?? []);
  if (patterns.length === 0) {
    throw new Error('No files or globs provided.');
  }

  const context = await getCommandContext({ startPath: options.basePath });
  const fileSystem = new NodeFileSystem();
  const sigService = new SigService(context.projectRoot, fileSystem);
  const identity =
    options.identity ??
    (await resolveUserIdentity({
      projectRoot: context.projectRoot,
      fileSystem
    }));

  await sigService.init();

  const matchedFiles = await resolvePatternTargets(patterns, options.basePath);
  const signed: Array<{ filePath: string; previousSigner: string | null }> = [];

  for (const filePath of matchedFiles) {
    if (sigService.isExcluded(filePath)) {
      continue;
    }

    const existing = await sigService.check(filePath).catch(() => undefined);
    await sigService.sign(filePath, identity);
    signed.push({
      filePath,
      previousSigner: existing?.signer ?? null
    });
  }

  if (signed.length === 0) {
    console.log('No signable files matched.');
    return;
  }

  console.log(`Signed ${signed.length} file${signed.length === 1 ? '' : 's'} as ${identity}`);
  for (const entry of signed) {
    if (!entry.previousSigner || entry.previousSigner === identity) {
      continue;
    }
    console.log(`  ${path.relative(context.projectRoot, entry.filePath) || path.basename(entry.filePath)} (was ${entry.previousSigner})`);
  }
}

export function createSignCommand() {
  return {
    name: 'sign',
    description: 'Sign files and globs with the current user identity',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      await signCommand({
        patterns: args,
        basePath: flags['base-path'] || process.cwd()
      });
    }
  };
}
