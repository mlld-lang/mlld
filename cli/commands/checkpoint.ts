import chalk from 'chalk';
import { existsSync } from 'fs';
import { readFile, rm } from 'fs/promises';
import path from 'path';
import { resolveCheckpointScriptCandidates } from '@interpreter/checkpoint/script-name';
import { checkpointsDir } from '@core/paths/state-dirs';

interface CheckpointRecord {
  key: string;
  fn: string;
  argsPreview: string;
  ts: string;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseCheckpointRecords(raw: string): CheckpointRecord[] {
  const rows: CheckpointRecord[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!isRecord(parsed)) {
        continue;
      }
      if (typeof parsed.key !== 'string' || typeof parsed.fn !== 'string') {
        continue;
      }
      rows.push({
        key: parsed.key,
        fn: parsed.fn,
        argsPreview: typeof parsed.argsPreview === 'string' ? parsed.argsPreview : '',
        ts: typeof parsed.ts === 'string' ? parsed.ts : '',
        ...parsed
      });
    } catch {
      // Ignore malformed lines; checkpoint files are append-only and may contain partial writes.
    }
  }
  return rows;
}

export interface CheckpointCommandOptions {
  basePath?: string;
}

class CheckpointCommand {
  private readonly cacheRoot: string;

  constructor(options: CheckpointCommandOptions = {}) {
    const root = options.basePath ?? process.cwd();
    this.cacheRoot = path.resolve(checkpointsDir(root));
  }

  async list(scriptRef: string): Promise<void> {
    const scriptName = this.resolveScriptName(scriptRef);
    const records = await this.loadRecords(scriptName);
    if (records.length === 0) {
      console.log(chalk.gray(`No checkpoint entries found for "${scriptRef}".`));
      return;
    }

    console.log(chalk.bold(`Checkpoint entries for ${scriptName}:`));
    for (const record of records) {
      const preview = record.argsPreview || '<empty>';
      console.log(`- ${record.fn} | ${preview} | ${record.key}`);
    }
    console.log(chalk.gray(`Total: ${records.length}`));
  }

  async inspect(scriptRef: string): Promise<void> {
    const scriptName = this.resolveScriptName(scriptRef);
    const [records, manifest] = await Promise.all([
      this.loadRecords(scriptName),
      this.loadManifest(scriptName)
    ]);

    const payload = {
      script: scriptName,
      cacheDir: this.getScriptDir(scriptName),
      manifest,
      records
    };
    console.log(JSON.stringify(payload, null, 2));
  }

  async clean(scriptRef: string): Promise<void> {
    const scriptName = this.resolveScriptName(scriptRef);
    const scriptDir = this.getScriptDir(scriptName);
    if (!existsSync(scriptDir)) {
      console.log(chalk.gray(`No checkpoint cache found for "${scriptRef}".`));
      return;
    }

    await rm(scriptDir, { recursive: true, force: true });
    console.log(chalk.green(`Cleared checkpoint cache for "${scriptName}".`));
  }

  private getScriptDir(scriptName: string): string {
    return path.join(this.cacheRoot, scriptName);
  }

  private resolveScriptName(scriptRef: string): string {
    const candidates = resolveCheckpointScriptCandidates(scriptRef);
    if (candidates.length === 0) {
      return scriptRef.trim();
    }

    for (const candidate of candidates) {
      if (existsSync(this.getScriptDir(candidate))) {
        return candidate;
      }
    }

    return candidates[candidates.length - 1];
  }

  private async loadRecords(scriptName: string): Promise<CheckpointRecord[]> {
    const cacheFile = path.join(this.getScriptDir(scriptName), 'llm-cache.jsonl');
    const raw = await this.readFileIfPresent(cacheFile);
    if (!raw) {
      return [];
    }
    return parseCheckpointRecords(raw);
  }

  private async loadManifest(scriptName: string): Promise<Record<string, unknown> | null> {
    const manifestPath = path.join(this.getScriptDir(scriptName), 'manifest.json');
    const raw = await this.readFileIfPresent(manifestPath);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async readFileIfPresent(filePath: string): Promise<string | null> {
    try {
      return await readFile(filePath, 'utf8');
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}

function usage(): string {
  return [
    'Usage:',
    '  mlld checkpoint list <script>',
    '  mlld checkpoint inspect <script>',
    '  mlld checkpoint clean <script>'
  ].join('\n');
}

export function createCheckpointCommand() {
  return {
    name: 'checkpoint',
    description: 'Inspect and manage checkpoint caches',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const subcommand = args[0] || 'list';
      const scriptRef = args[1];
      const basePath =
        typeof flags['base-path'] === 'string' && flags['base-path'].trim().length > 0
          ? flags['base-path']
          : process.cwd();
      const command = new CheckpointCommand({ basePath });

      if (!scriptRef) {
        console.error(chalk.red('Error: script name is required.'));
        console.error(usage());
        process.exit(1);
      }

      try {
        if (subcommand === 'list') {
          await command.list(scriptRef);
          return;
        }
        if (subcommand === 'inspect') {
          await command.inspect(scriptRef);
          return;
        }
        if (subcommand === 'clean') {
          await command.clean(scriptRef);
          return;
        }

        console.error(chalk.red(`Unknown checkpoint subcommand: ${subcommand}`));
        console.error(usage());
        process.exit(1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Checkpoint command failed: ${message}`));
        process.exit(1);
      }
    }
  };
}
