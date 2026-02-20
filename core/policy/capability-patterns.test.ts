import { describe, it, expect } from 'vitest';
import { matchesFsPattern, parseFsPatternEntry } from './capability-patterns';

describe('parseFsPatternEntry', () => {
  it('expands fs shorthand entries', () => {
    expect(parseFsPatternEntry('fs')).toEqual({ mode: 'write', pattern: '**' });
    expect(parseFsPatternEntry('fs:r')).toEqual({ mode: 'read', pattern: '**' });
    expect(parseFsPatternEntry('fs:w')).toEqual({ mode: 'write', pattern: '**' });
    expect(parseFsPatternEntry('fs:rw')).toEqual({ mode: 'write', pattern: '**' });
  });
});

describe('matchesFsPattern', () => {
  const basePath = '/project';
  const homeDir = '/home/user';

  it('matches @base patterns', () => {
    expect(matchesFsPattern('/project/tmp/file.txt', '@base/tmp/**', basePath, homeDir)).toBe(true);
  });

  it('matches home patterns', () => {
    expect(matchesFsPattern('/home/user/.ssh/id_rsa', '~/.ssh/*', basePath, homeDir)).toBe(true);
  });

  it('matches relative patterns from base', () => {
    expect(matchesFsPattern('/project/.env', '**/.env', basePath, homeDir)).toBe(true);
  });
});
