import { spawn } from 'child_process';
import type { KeychainProvider } from './KeychainResolver';

export class MacOSKeychainProvider implements KeychainProvider {
  async get(service: string, account: string): Promise<string | null> {
    try {
      const result = await this.exec('security', [
        'find-generic-password',
        '-s', service,
        '-a', account,
        '-w'
      ]);
      return result.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('could not be found') ||
          errorMessage.includes('SecKeychainSearchCopyNext')) {
        return null;
      }
      throw error;
    }
  }

  async set(service: string, account: string, value: string): Promise<void> {
    // -U flag updates if exists, creates if not
    await this.exec('security', [
      'add-generic-password',
      '-s', service,
      '-a', account,
      '-w', value,
      '-U'
    ]);
  }

  async delete(service: string, account: string): Promise<void> {
    try {
      await this.exec('security', [
        'delete-generic-password',
        '-s', service,
        '-a', account
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('could not be found') &&
          !errorMessage.includes('SecKeychainSearchCopyNext')) {
        throw error;
      }
    }
  }

  async list(service: string): Promise<string[]> {
    const output = await this.exec('security', ['dump-keychain']);
    const accounts = new Set<string>();
    let currentService: string | null = null;
    let currentAccount: string | null = null;

    const flush = () => {
      if (currentService === service && currentAccount) {
        accounts.add(currentAccount);
      }
    };

    for (const line of output.split('\n')) {
      if (line.startsWith('keychain:') || line.startsWith('class:') || line.trim() === '') {
        if (currentService || currentAccount) {
          flush();
          currentService = null;
          currentAccount = null;
        }
        continue;
      }

      const serviceMatch = line.match(/\"svce\"<blob>=\"([^\"]*)\"/);
      if (serviceMatch) {
        currentService = serviceMatch[1];
        continue;
      }

      const accountMatch = line.match(/\"acct\"<blob>=\"([^\"]*)\"/);
      if (accountMatch) {
        currentAccount = accountMatch[1];
      }
    }

    flush();
    return Array.from(accounts).sort();
  }

  private async exec(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}
