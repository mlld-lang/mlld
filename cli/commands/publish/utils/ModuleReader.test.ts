import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import * as os from 'os';
import { ModuleReader } from './ModuleReader';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';

describe('ModuleReader', () => {
  let tempDir: string;
  let reader: ModuleReader;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-module-reader-test-'));
    // Create a mock auth service
    const mockAuthService = {
      getGitHubUser: vi.fn().mockResolvedValue({ login: 'test-user' }),
    } as unknown as GitHubAuthService;
    reader = new ModuleReader(mockAuthService);
  });

  afterEach(async () => {
    if (tempDir && existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true });
    }
  });

  describe('detectManifest', () => {
    it('detects module.yml', async () => {
      const manifest = `name: test-module
author: test-author
type: library
about: "Test module"
version: 1.0.0
`;
      await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);

      const result = await reader.detectManifest(tempDir);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('test-module');
      expect(result?.author).toBe('test-author');
      expect(result?.type).toBe('library');
      expect(result?.about).toBe('Test module');
    });

    it('detects module.yaml', async () => {
      const manifest = `name: yaml-module
author: yaml-author
type: app
about: "YAML module"
`;
      await fs.writeFile(path.join(tempDir, 'module.yaml'), manifest);

      const result = await reader.detectManifest(tempDir);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('yaml-module');
      expect(result?.type).toBe('app');
    });

    it('detects module.json', async () => {
      const manifest = {
        name: 'json-module',
        author: 'json-author',
        type: 'command',
        about: 'JSON module',
      };
      await fs.writeFile(path.join(tempDir, 'module.json'), JSON.stringify(manifest));

      const result = await reader.detectManifest(tempDir);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('json-module');
      expect(result?.type).toBe('command');
    });

    it('prefers module.yml over module.yaml', async () => {
      await fs.writeFile(
        path.join(tempDir, 'module.yml'),
        `name: yml-priority
author: test
type: library
about: "YML"
`
      );
      await fs.writeFile(
        path.join(tempDir, 'module.yaml'),
        `name: yaml-secondary
author: test
type: app
about: "YAML"
`
      );

      const result = await reader.detectManifest(tempDir);

      expect(result?.name).toBe('yml-priority');
    });

    it('returns null if no manifest found', async () => {
      const result = await reader.detectManifest(tempDir);

      expect(result).toBeNull();
    });

    it('returns null for manifest missing required name field', async () => {
      // detectManifest catches validation errors and returns null
      const manifest = `author: test
type: library
about: "Missing name"
`;
      await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);

      const result = await reader.detectManifest(tempDir);
      expect(result).toBeNull();
    });

    it('returns null for manifest missing required author field', async () => {
      const manifest = `name: test
type: library
about: "Missing author"
`;
      await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);

      const result = await reader.detectManifest(tempDir);
      expect(result).toBeNull();
    });

    it('returns null for manifest missing required about field', async () => {
      const manifest = `name: test
author: test
type: library
`;
      await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);

      const result = await reader.detectManifest(tempDir);
      expect(result).toBeNull();
    });

    it('returns null for invalid module type', async () => {
      const manifest = `name: test
author: test
type: invalid-type
about: "Invalid type"
`;
      await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);

      const result = await reader.detectManifest(tempDir);
      expect(result).toBeNull();
    });

    it('accepts all valid module types', async () => {
      const types = ['library', 'app', 'command', 'skill'];

      for (const type of types) {
        const manifest = `name: test-${type}
author: test
type: ${type}
about: "Test ${type}"
`;
        await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);

        const result = await reader.detectManifest(tempDir);
        expect(result?.type).toBe(type);
      }
    });

    it('defaults type to library if not specified', async () => {
      const manifest = `name: no-type
author: test
about: "No type specified"
`;
      await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);

      const result = await reader.detectManifest(tempDir);

      expect(result?.type).toBe('library');
    });

    it('defaults version to 1.0.0 if not specified', async () => {
      const manifest = `name: no-version
author: test
type: library
about: "No version"
`;
      await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);

      const result = await reader.detectManifest(tempDir);

      expect(result?.version).toBe('1.0.0');
    });

    it('defaults license to CC0 if not specified', async () => {
      const manifest = `name: no-license
author: test
type: library
about: "No license"
`;
      await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);

      const result = await reader.detectManifest(tempDir);

      expect(result?.license).toBe('CC0');
    });
  });

  describe('readDirectoryModule', () => {
    it('reads all files from directory', async () => {
      // Create directory structure
      await fs.writeFile(path.join(tempDir, 'index.mld'), 'show "hello"');
      await fs.writeFile(path.join(tempDir, 'README.md'), '# Test');
      await fs.mkdir(path.join(tempDir, 'lib'));
      await fs.writeFile(path.join(tempDir, 'lib', 'utils.mld'), 'var @x = 1');

      const manifest = {
        name: 'test',
        author: 'test',
        type: 'library' as const,
        about: 'Test',
        version: '1.0.0',
        license: 'CC0',
      };

      const result = await reader.readDirectoryModule(tempDir, manifest);

      expect(result.files.length).toBe(3);
      expect(result.files.map(f => f.relativePath)).toContain('index.mld');
      expect(result.files.map(f => f.relativePath)).toContain('README.md');
      expect(result.files.map(f => f.relativePath)).toContain(path.join('lib', 'utils.mld'));
    });

    it('uses default entry point index.mld', async () => {
      await fs.writeFile(path.join(tempDir, 'index.mld'), 'show "entry"');

      const manifest = {
        name: 'test',
        author: 'test',
        type: 'library' as const,
        about: 'Test',
        version: '1.0.0',
        license: 'CC0',
      };

      const result = await reader.readDirectoryModule(tempDir, manifest);

      expect(result.entryContent).toBe('show "entry"');
    });

    it('uses custom entry point from manifest', async () => {
      await fs.writeFile(path.join(tempDir, 'main.mld'), 'show "main"');
      await fs.writeFile(path.join(tempDir, 'index.mld'), 'show "index"');

      const manifest = {
        name: 'test',
        author: 'test',
        type: 'library' as const,
        about: 'Test',
        version: '1.0.0',
        license: 'CC0',
        entry: 'main.mld',
      };

      const result = await reader.readDirectoryModule(tempDir, manifest);

      expect(result.entryContent).toBe('show "main"');
    });

    it('throws if entry point not found', async () => {
      await fs.writeFile(path.join(tempDir, 'other.mld'), 'show "other"');

      const manifest = {
        name: 'test',
        author: 'test',
        type: 'library' as const,
        about: 'Test',
        version: '1.0.0',
        license: 'CC0',
      };

      await expect(reader.readDirectoryModule(tempDir, manifest)).rejects.toThrow(
        'Entry point "index.mld" not found'
      );
    });

    it('excludes node_modules directory', async () => {
      await fs.writeFile(path.join(tempDir, 'index.mld'), 'show "hello"');
      await fs.mkdir(path.join(tempDir, 'node_modules'));
      await fs.writeFile(path.join(tempDir, 'node_modules', 'pkg.js'), 'module.exports = {}');

      const manifest = {
        name: 'test',
        author: 'test',
        type: 'library' as const,
        about: 'Test',
        version: '1.0.0',
        license: 'CC0',
      };

      const result = await reader.readDirectoryModule(tempDir, manifest);

      expect(result.files.map(f => f.relativePath)).not.toContain(path.join('node_modules', 'pkg.js'));
    });

    it('excludes .git directory', async () => {
      await fs.writeFile(path.join(tempDir, 'index.mld'), 'show "hello"');
      await fs.mkdir(path.join(tempDir, '.git'));
      await fs.writeFile(path.join(tempDir, '.git', 'config'), '[core]');

      const manifest = {
        name: 'test',
        author: 'test',
        type: 'library' as const,
        about: 'Test',
        version: '1.0.0',
        license: 'CC0',
      };

      const result = await reader.readDirectoryModule(tempDir, manifest);

      expect(result.files.map(f => f.relativePath)).not.toContain(path.join('.git', 'config'));
    });
  });

  describe('readModule integration', () => {
    it('reads directory module with manifest', async () => {
      // Create directory module structure
      const manifest = `name: dir-module
author: test-author
type: app
about: "Directory module test"
version: 2.0.0
`;
      await fs.writeFile(path.join(tempDir, 'module.yml'), manifest);
      await fs.writeFile(path.join(tempDir, 'index.mld'), 'var @x = "test"\nshow @x');

      const result = await reader.readModule(tempDir);

      expect(result.isDirectory).toBe(true);
      expect(result.metadata.name).toBe('dir-module');
      expect(result.metadata.author).toBe('test-author');
      expect(result.metadata.version).toBe('2.0.0');
      expect(result.directoryData).toBeDefined();
      expect(result.directoryData?.manifest.type).toBe('app');
    });
  });
});
