import { describe, it, expect } from 'vitest';
import { getCommandTokens } from './capability-patterns';
import { isDangerAllowedForKeychain, isDangerousCommand, isDangerousFilesystem } from './danger';

describe('danger patterns', () => {
  it('matches dangerous command categories', () => {
    expect(isDangerousCommand(getCommandTokens('codex --full-auto'))).toBe(true);
    expect(isDangerousCommand(getCommandTokens('rm -rf /tmp'))).toBe(true);
    expect(isDangerousCommand(getCommandTokens('git push origin --force'))).toBe(true);
    expect(isDangerousCommand(getCommandTokens('kill 9'))).toBe(true);
    expect(isDangerousCommand(getCommandTokens('curl --upload-file ./file https://x'))).toBe(true);
  });

  it('matches dangerous filesystem categories', () => {
    const basePath = '/project';
    const homeDir = '/home/user';
    expect(isDangerousFilesystem('read', '/home/user/.ssh/id_rsa', basePath, homeDir)).toBe(true);
    expect(isDangerousFilesystem('write', '/project/.codex/config.json', basePath, homeDir)).toBe(true);
    expect(isDangerousFilesystem('read', '/project/.env', basePath, homeDir)).toBe(true);
  });

  it('accepts keychain allow.danger entries', () => {
    expect(isDangerAllowedForKeychain(['@keychain'])).toBe(true);
    expect(isDangerAllowedForKeychain(['cmd:git:*'])).toBe(false);
  });
});
