import path from 'node:path';
import { homedir } from 'node:os';
import { minimatch } from 'minimatch';
import type { PolicyConfig } from '@core/policy/union';
import { matchesFsPattern } from '@core/policy/capability-patterns';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { FileVerifyResult, SigService } from './sig-service';
import { resolveSignerLabels } from '@interpreter/policy/signer-labels';

export interface SigStatusEntry extends FileVerifyResult {
  labels: string[];
  taint: string[];
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function hasGlobMagic(value: string): boolean {
  return /[*?[\]{}()]/.test(value);
}

function normalizePathFilterBase(
  pattern: string,
  projectRoot: string,
  basePath: string
): { candidate: string; matcher: string } {
  if (pattern.startsWith('@root/') || pattern.startsWith('@base/')) {
    return {
      candidate: toPosix(path.relative(projectRoot, projectRoot)),
      matcher: toPosix(pattern.replace(/^@(root|base)\//, ''))
    };
  }

  if (path.isAbsolute(pattern)) {
    return {
      candidate: '',
      matcher: toPosix(path.resolve(pattern))
    };
  }

  return {
    candidate: toPosix(path.relative(basePath, basePath)),
    matcher: toPosix(pattern)
  };
}

function matchesPathFilter(
  filePath: string,
  pattern: string,
  projectRoot: string,
  basePath: string
): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return true;
  }

  const normalizedFilePath = toPosix(path.resolve(filePath));
  const normalizedProjectRelative = toPosix(path.relative(projectRoot, normalizedFilePath));
  const normalizedBaseRelative = toPosix(path.relative(basePath, normalizedFilePath));

  if (trimmed.startsWith('@root/') || trimmed.startsWith('@base/')) {
    const matcher = toPosix(trimmed.replace(/^@(root|base)\//, ''));
    if (!hasGlobMagic(matcher)) {
      return normalizedProjectRelative === matcher;
    }
    return minimatch(normalizedProjectRelative, matcher, {
      dot: true,
      nocase: process.platform === 'win32'
    });
  }

  if (path.isAbsolute(trimmed)) {
    const matcher = toPosix(path.resolve(trimmed));
    if (!hasGlobMagic(matcher)) {
      return normalizedFilePath === matcher;
    }
    return minimatch(normalizedFilePath, matcher, {
      dot: true,
      nocase: process.platform === 'win32'
    });
  }

  if (!hasGlobMagic(trimmed)) {
    const resolved = toPosix(path.resolve(basePath, trimmed));
    return normalizedFilePath === resolved || normalizedProjectRelative === toPosix(trimmed);
  }

  return minimatch(normalizedBaseRelative, toPosix(trimmed), {
    dot: true,
    nocase: process.platform === 'win32'
  });
}

export function toSigStatusEntry(
  verifyResult: FileVerifyResult,
  policy?: PolicyConfig
): SigStatusEntry {
  const taint = Array.isArray(verifyResult.metadata?.taint)
    ? verifyResult.metadata.taint.map(String).filter(Boolean)
    : [];
  const labels = resolveSignerLabels(
    verifyResult.signer,
    verifyResult.status,
    policy?.signers,
    policy?.defaults?.unlabeled
  );

  return {
    ...verifyResult,
    labels,
    taint
  };
}

export function getSigStatusAliases(entry: SigStatusEntry): string[] {
  const aliases = new Set<string>();
  if (entry.path) {
    aliases.add(entry.path);
  }
  if (entry.relativePath) {
    aliases.add(entry.relativePath);
    aliases.add(`./${entry.relativePath}`);
  }
  return Array.from(aliases);
}

export async function walkFilesRecursive(
  fileSystem: IFileSystemService,
  rootDir: string
): Promise<string[]> {
  const results: string[] = [];
  const visited = new Set<string>();

  const walk = async (currentDir: string): Promise<void> => {
    const normalizedDir = path.resolve(currentDir);
    if (visited.has(normalizedDir)) {
      return;
    }
    visited.add(normalizedDir);

    const exists = await fileSystem.exists(normalizedDir).catch(() => false);
    if (!exists) {
      return;
    }

    const entries = await fileSystem.readdir(normalizedDir).catch(() => []);
    for (const entry of entries) {
      const absolutePath = path.join(normalizedDir, entry);
      const stat = await fileSystem.stat(absolutePath).catch(() => null);
      if (!stat) {
        continue;
      }
      if (stat.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (stat.isFile()) {
        results.push(path.resolve(absolutePath));
      }
    }
  };

  await walk(rootDir);
  return results.sort();
}

export async function listSignedFiles(
  fileSystem: IFileSystemService,
  projectRoot: string
): Promise<string[]> {
  const sigDir = path.join(projectRoot, '.sig', 'sigs');
  const signatureFiles = await walkFilesRecursive(fileSystem, sigDir);
  const results = new Set<string>();

  for (const signaturePath of signatureFiles) {
    if (!signaturePath.endsWith('.sig.json')) {
      continue;
    }

    const relativeSignaturePath = toPosix(path.relative(sigDir, signaturePath));
    const relativeTargetPath = relativeSignaturePath.slice(0, -'.sig.json'.length);
    const targetPath = path.resolve(projectRoot, relativeTargetPath);
    const exists = await fileSystem.exists(targetPath).catch(() => false);
    if (!exists) {
      continue;
    }
    const stat = await fileSystem.stat(targetPath).catch(() => null);
    if (stat?.isFile()) {
      results.add(targetPath);
    }
  }

  return Array.from(results).sort();
}

export async function listIntegrityPolicyFiles(
  fileSystem: IFileSystemService,
  projectRoot: string,
  policy?: PolicyConfig,
  sigService?: SigService
): Promise<string[]> {
  const rules = policy?.filesystem_integrity;
  if (!rules || Object.keys(rules).length === 0) {
    return [];
  }

  const files = await walkFilesRecursive(fileSystem, projectRoot);
  const basePath = projectRoot;
  const homeDir = homedir();
  const results = new Set<string>();

  for (const filePath of files) {
    if (sigService?.isExcluded(filePath)) {
      continue;
    }
    if (
      Object.keys(rules).some((pattern) =>
        matchesFsPattern(filePath, pattern, basePath, homeDir)
      )
    ) {
      results.add(filePath);
    }
  }

  return Array.from(results).sort();
}

export async function listStatusTargets(options: {
  fileSystem: IFileSystemService;
  projectRoot: string;
  policy?: PolicyConfig;
  sigService?: SigService;
  filterPattern?: string;
  basePath?: string;
}): Promise<string[]> {
  const basePath = options.basePath ?? options.projectRoot;
  const [signedFiles, policyFiles] = await Promise.all([
    listSignedFiles(options.fileSystem, options.projectRoot),
    listIntegrityPolicyFiles(options.fileSystem, options.projectRoot, options.policy, options.sigService)
  ]);

  const combined = new Set<string>([...signedFiles, ...policyFiles]);
  const files = Array.from(combined).sort();
  if (!options.filterPattern) {
    return files;
  }

  return files.filter((filePath) =>
    matchesPathFilter(filePath, options.filterPattern!, options.projectRoot, basePath)
  );
}

export async function verifyPatternStatuses(options: {
  sigService: SigService;
  fileSystem: IFileSystemService;
  projectRoot: string;
  policy?: PolicyConfig;
  pattern: string;
  basePath?: string;
}): Promise<SigStatusEntry[]> {
  const basePath = options.basePath ?? options.projectRoot;
  const files = await walkFilesRecursive(options.fileSystem, options.projectRoot);
  const matches = files.filter((filePath) => {
    if (options.sigService.isExcluded(filePath)) {
      return false;
    }
    return matchesPathFilter(filePath, options.pattern, options.projectRoot, basePath);
  });

  const entries = await Promise.all(
    matches.map(async (filePath) => {
      const verifyResult = await options.sigService.verify(filePath);
      return toSigStatusEntry(verifyResult, options.policy);
    })
  );

  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
