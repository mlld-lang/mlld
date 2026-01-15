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
