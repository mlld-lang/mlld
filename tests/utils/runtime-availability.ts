import { execSync } from 'child_process';

type CommandRunner = (command: string, options: { stdio: 'ignore' }) => unknown;

export function isPython3RuntimeAvailable(runCommand: CommandRunner = execSync as CommandRunner): boolean {
  try {
    runCommand('python3 --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
