import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigLoader } from './loader';
import { parseDuration, parseSize, formatDuration, formatSize } from './utils';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn()
}));

import * as fs from 'fs';

describe('Configuration System', () => {
  describe('Duration Parsing', () => {
    it('should parse milliseconds', () => {
      expect(parseDuration('100')).toBe(100);
      expect(parseDuration('1500ms')).toBe(1500);
      expect(parseDuration(2000)).toBe(2000);
    });

    it('should parse seconds', () => {
      expect(parseDuration('5s')).toBe(5000);
      expect(parseDuration('1.5s')).toBe(1500);
      expect(parseDuration('30s')).toBe(30000);
    });

    it('should parse minutes', () => {
      expect(parseDuration('5m')).toBe(5 * 60 * 1000);
      expect(parseDuration('1.5m')).toBe(90000);
      expect(parseDuration('10m')).toBe(600000);
    });

    it('should parse hours', () => {
      expect(parseDuration('1h')).toBe(60 * 60 * 1000);
      expect(parseDuration('2.5h')).toBe(2.5 * 60 * 60 * 1000);
      expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
    });

    it('should parse days', () => {
      expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
      expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseDuration('0.5d')).toBe(12 * 60 * 60 * 1000);
    });

    it('should throw on invalid format', () => {
      expect(() => parseDuration('abc')).toThrow('Invalid duration format');
      expect(() => parseDuration('5x')).toThrow('Invalid duration format');
    });
  });

  describe('Size Parsing', () => {
    it('should parse bytes', () => {
      expect(parseSize('100')).toBe(100);
      expect(parseSize('1024B')).toBe(1024);
      expect(parseSize(2048)).toBe(2048);
    });

    it('should parse kilobytes', () => {
      expect(parseSize('1KB')).toBe(1024);
      expect(parseSize('10KB')).toBe(10240);
      expect(parseSize('1.5KB')).toBe(1536);
    });

    it('should parse megabytes', () => {
      expect(parseSize('1MB')).toBe(1024 * 1024);
      expect(parseSize('5MB')).toBe(5 * 1024 * 1024);
      expect(parseSize('10.5MB')).toBe(Math.floor(10.5 * 1024 * 1024));
    });

    it('should parse gigabytes', () => {
      expect(parseSize('1GB')).toBe(1024 * 1024 * 1024);
      expect(parseSize('2.5GB')).toBe(Math.floor(2.5 * 1024 * 1024 * 1024));
    });

    it('should throw on invalid format', () => {
      expect(() => parseSize('abc')).toThrow('Invalid size format');
      expect(() => parseSize('5XB')).toThrow('Invalid size format');
    });
  });

  describe('Duration Formatting', () => {
    it('should format durations correctly', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(300000)).toBe('5m');
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(86400000)).toBe('1d');
    });
  });

  describe('Size Formatting', () => {
    it('should format sizes correctly', () => {
      expect(formatSize(100)).toBe('100B');
      expect(formatSize(1024)).toBe('1.0KB');
      expect(formatSize(1536)).toBe('1.5KB');
      expect(formatSize(1048576)).toBe('1.0MB');
      expect(formatSize(5242880)).toBe('5.0MB');
      expect(formatSize(1073741824)).toBe('1.0GB');
    });
  });

  describe('ConfigLoader', () => {
    const testProjectPath = '/test/project';
    const globalConfigPath = path.join(os.homedir(), '.config', 'mlld.json');
    const projectConfigPath = path.join(testProjectPath, 'mlld.config.json');
    
    let mockFiles: Record<string, string> = {};

    beforeEach(() => {
      mockFiles = {};
      vi.clearAllMocks();

      // Configure mocked fs methods
      vi.mocked(fs.existsSync).mockImplementation((path: string) => {
        return path in mockFiles;
      });

      vi.mocked(fs.readFileSync).mockImplementation((path: string) => {
        if (path in mockFiles) {
          return mockFiles[path];
        }
        throw new Error(`File not found: ${path}`);
      });
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should load empty config when no files exist', () => {
      const loader = new ConfigLoader(testProjectPath);
      const config = loader.load();
      expect(config).toEqual({});
    });

    it('should load global config only', () => {
      mockFiles[globalConfigPath] = JSON.stringify({
        security: {
          urls: {
            enabled: true,
            allowedDomains: ['github.com']
          }
        }
      });

      const loader = new ConfigLoader(testProjectPath);
      const config = loader.load();
      
      expect(config.security?.urls?.enabled).toBe(true);
      expect(config.security?.urls?.allowedDomains).toEqual(['github.com']);
    });

    it('should load project config only', () => {
      mockFiles[projectConfigPath] = JSON.stringify({
        security: {
          urls: {
            enabled: false,
            blockedDomains: ['evil.com']
          }
        }
      });

      const loader = new ConfigLoader(testProjectPath);
      const config = loader.load();
      
      expect(config.security?.urls?.enabled).toBe(false);
      expect(config.security?.urls?.blockedDomains).toEqual(['evil.com']);
    });

    it('should merge global and project configs', () => {
      mockFiles[globalConfigPath] = JSON.stringify({
        security: {
          urls: {
            enabled: true,
            allowedDomains: ['github.com'],
            timeout: '30s'
          }
        }
      });

      mockFiles[projectConfigPath] = JSON.stringify({
        security: {
          urls: {
            allowedDomains: ['gitlab.com'],
            blockedDomains: ['evil.com'],
            timeout: '60s'
          }
        }
      });

      const loader = new ConfigLoader(testProjectPath);
      const config = loader.load();
      
      // Project overrides enabled
      expect(config.security?.urls?.enabled).toBe(true);
      // Arrays are merged
      expect(config.security?.urls?.allowedDomains).toEqual(['github.com', 'gitlab.com']);
      // Project adds blocked domains
      expect(config.security?.urls?.blockedDomains).toEqual(['evil.com']);
      // Project overrides timeout
      expect(config.security?.urls?.timeout).toBe('60s');
    });

    it('should merge cache rules correctly', () => {
      mockFiles[globalConfigPath] = JSON.stringify({
        cache: {
          urls: {
            enabled: true,
            defaultTTL: '5m',
            rules: [
              { pattern: '*.md', ttl: '1h' },
              { pattern: 'https://api.github.com/*', ttl: '1m' }
            ]
          }
        }
      });

      mockFiles[projectConfigPath] = JSON.stringify({
        cache: {
          urls: {
            defaultTTL: '10m',
            rules: [
              { pattern: 'https://api.github.com/*', ttl: '30s' },
              { pattern: '*.json', ttl: '5m' }
            ]
          }
        }
      });

      const loader = new ConfigLoader(testProjectPath);
      const config = loader.load();
      
      expect(config.cache?.urls?.defaultTTL).toBe('10m');
      expect(config.cache?.urls?.rules).toHaveLength(3);
      
      // Project rule overrides global for same pattern
      const githubRule = config.cache?.urls?.rules?.find(r => r.pattern === 'https://api.github.com/*');
      expect(githubRule?.ttl).toBe('30s');
      
      // Global rule preserved if no conflict
      const mdRule = config.cache?.urls?.rules?.find(r => r.pattern === '*.md');
      expect(mdRule?.ttl).toBe('1h');
    });

    it('should resolve URL config correctly', () => {
      mockFiles[projectConfigPath] = JSON.stringify({
        security: {
          urls: {
            enabled: true,
            allowedDomains: ['github.com'],
            blockedDomains: ['evil.com'],
            maxSize: '10MB',
            timeout: '30s',
            warnOnInsecureProtocol: false
          }
        },
        cache: {
          urls: {
            enabled: true,
            defaultTTL: '5m',
            rules: [
              { pattern: 'https://api.github.com/*', ttl: '1m' }
            ]
          }
        }
      });

      const loader = new ConfigLoader(testProjectPath);
      const config = loader.load();
      const resolved = loader.resolveURLConfig(config);

      expect(resolved).toBeDefined();
      expect(resolved?.enabled).toBe(true);
      expect(resolved?.allowedDomains).toEqual(['github.com']);
      expect(resolved?.blockedDomains).toEqual(['evil.com']);
      expect(resolved?.maxSize).toBe(10 * 1024 * 1024);
      expect(resolved?.timeout).toBe(30000);
      expect(resolved?.warnOnInsecureProtocol).toBe(false);
      expect(resolved?.cache.enabled).toBe(true);
      expect(resolved?.cache.defaultTTL).toBe(5 * 60 * 1000);
      expect(resolved?.cache.rules).toHaveLength(1);
      expect(resolved?.cache.rules[0].pattern).toBeInstanceOf(RegExp);
      expect(resolved?.cache.rules[0].ttl).toBe(60000);
    });

    it('should convert URL patterns to regex correctly', () => {
      mockFiles[projectConfigPath] = JSON.stringify({
        security: {
          urls: {
            enabled: true
          }
        },
        cache: {
          urls: {
            rules: [
              { pattern: 'https://github.com/*', ttl: '1h' },
              { pattern: '*.md', ttl: '24h' },
              { pattern: 'https://api.github.com/repos/*/releases', ttl: '10m' }
            ]
          }
        }
      });

      const loader = new ConfigLoader(testProjectPath);
      const config = loader.load();
      const resolved = loader.resolveURLConfig(config);

      expect(resolved).toBeDefined();
      const rules = resolved?.cache.rules || [];
      expect(rules.length).toBe(3);
      
      expect(rules[0].pattern.test('https://github.com/user/repo')).toBe(true);
      expect(rules[0].pattern.test('https://gitlab.com/user/repo')).toBe(false);
      
      expect(rules[1].pattern.test('README.md')).toBe(true);
      expect(rules[1].pattern.test('file.txt')).toBe(false);
      
      expect(rules[2].pattern.test('https://api.github.com/repos/owner/releases')).toBe(true);
      expect(rules[2].pattern.test('https://api.github.com/users')).toBe(false);
    });
  });
});