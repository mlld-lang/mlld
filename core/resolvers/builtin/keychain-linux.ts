import { spawn, spawnSync } from 'child_process';
import type { KeychainProvider } from './KeychainResolver';

type ExecError = Error & { code?: number; stderr?: string };

export function isSecretToolAvailable(): boolean {
  const result = spawnSync('secret-tool', ['--help'], { stdio: 'ignore' });
  if (result.error) {
    return false;
  }
  return true;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function extractAccounts(output: string, service: string): string[] {
  const accounts = new Set<string>();
  const servicePrefix = `${service}/`;
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const labelMatch = trimmed.match(/^label\s*=\s*(.+)$/i);
    if (labelMatch) {
      const label = stripQuotes(labelMatch[1]);
      if (label.startsWith(servicePrefix)) {
        accounts.add(label.slice(servicePrefix.length));
      }
      continue;
    }

    const accountMatch =
      trimmed.match(/^attribute[ .]account\s*=\s*(.+)$/i) ||
      trimmed.match(/^attribute[ .]account:\s*(.+)$/i);
    if (accountMatch) {
      accounts.add(stripQuotes(accountMatch[1]));
    }
  }

  return Array.from(accounts).sort();
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('no such secret') || normalized.includes('not found');
}

export class LinuxKeychainProvider implements KeychainProvider {
  async get(service: string, account: string): Promise<string | null> {
    try {
      const result = await this.exec('secret-tool', [
        'lookup',
        'service',
        service,
        'account',
        account
      ]);
      const trimmed = result.trim();
      return trimmed ? trimmed : null;
    } catch (error) {
      const execError = error as ExecError;
      if (execError.code === 1 || isNotFoundError(execError)) {
        return null;
      }
      throw error;
    }
  }

  async set(service: string, account: string, value: string): Promise<void> {
    await this.exec(
      'secret-tool',
      ['store', '--label', `${service}/${account}`, 'service', service, 'account', account],
      value
    );
  }

  async delete(service: string, account: string): Promise<void> {
    try {
      await this.exec('secret-tool', ['clear', 'service', service, 'account', account]);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }

  async list(service: string): Promise<string[]> {
    try {
      const output = await this.exec('secret-tool', ['search', '--all', 'service', service]);
      return extractAccounts(output, service);
    } catch (error) {
      const execError = error as ExecError;
      if (execError.code === 1 || isNotFoundError(execError)) {
        return [];
      }
      throw error;
    }
  }

  private async exec(command: string, args: string[], stdin?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data;
      });
      proc.stderr.on('data', (data) => {
        stderr += data;
      });

      if (stdin !== undefined) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        const error = new Error(stderr || `Command failed with code ${code}`) as ExecError;
        if (typeof code === 'number') {
          error.code = code;
        }
        if (stderr) {
          error.stderr = stderr;
        }
        reject(error);
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}
