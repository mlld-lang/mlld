import { describe, it, expect, beforeEach } from 'vitest';
import { processMlld, MlldError, VirtualFS, fsStatus, sign, verify, signContent } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { access, mkdir, mkdtemp, readFile, rm, writeFile as writeNodeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

describe('Mlld API', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  const originalStrict = process.env.MLLD_STRICT;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    process.env.MLLD_STRICT = '1';
  });

  afterAll(() => {
    process.env.MLLD_STRICT = originalStrict;
  });

  describe('processMlld', () => {
    it('should process simple text assignment', async () => {
      const content = '/var @greeting = "Hello, World!"';
      const result = await processMlld(content);
      // Text assignment alone doesn't produce output (just trailing newline from normalizer)
      expect(result).toBe('\n');
    });

    it('should process text with show directive', async () => {
      const content = `
/var @greeting = "Hello, World!"
/show @greeting
      `.trim();
      const result = await processMlld(content);
      expect(result.trim()).toBe('Hello, World!');
    });

    it('should process with custom options', async () => {
      const content = '/show "Hello, World!"';
      const result = await processMlld(content, {
        format: 'markdown',
        basePath: '/custom/path'
      });
      expect(result.trim()).toBe('Hello, World!');
    });

    it('should process with custom file system', async () => {
      // Set up a test file in memory
      await fileSystem.writeFile('/test.md', '# Test Content\nThis is a test file.');
      
      const content = `
/show </test.md>
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      // Markdown formatting adds blank line after header
      expect(result.trim()).toBe('# Test Content\n\nThis is a test file.');
    });

    it.skip('should handle data directives', async () => {
      const content = '/var @config = { name: "Test", version: 1.0 }\n/show @config';
      const result = await processMlld(content, { format: 'xml' });
      expect(result).toContain('<MLLD_OUTPUT>');
      // Should only show content that is explicitly output
      expect(result).toContain('"name": "Test"');
      expect(result).toContain('"version": 1');
    });

    it('should handle template interpolation', async () => {
      const content = `
/var @name = "World"
/var @greeting = :::Hello, {{name}}!:::
/show @greeting
      `.trim();
      const result = await processMlld(content);
      expect(result.trim()).toBe('Hello, World!');
    });

    it('should handle import directives', async () => {
      // Set up a test file to import
      await fileSystem.writeFile('/utils.mld', '/var @helper = "Helper Text"');
      
      const content = `
/import { helper } from "/utils.mld"
/show @helper
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('Helper Text');
    });

    it('should keep path-like values as text via var assignment', async () => {
      const content = `
/var @testPath = "/nonexistent.md"
/show @testPath
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('/nonexistent.md');
    });

    it('should process show directive with sections', async () => {
      // Set up a test file with sections
      await fileSystem.writeFile('/doc.md', `# Document\n\n## Section One\nContent 1\n\n## Section Two\nContent 2`);
      
      const content = '/show </doc.md # Section Two>';
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('## Section Two\n\nContent 2');
    });

    it('should handle run directive', async () => {
      const content = '/run cmd {echo "test"}';
      const result = await processMlld(content);
      // Run command directives produce output
      expect(result.trim()).toBe('test');
    });

    it('should export MlldError class', () => {
      expect(MlldError).toBeDefined();
      const error = new MlldError('Test error', { code: 'TEST_ERROR' });
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
    });

    it('exports signing and filesystem status helpers', async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'mlld-sdk-sig-'));

      try {
        await writeNodeFile(path.join(root, 'package.json'), '{}');
        await mkdir(path.join(root, 'docs'), { recursive: true });
        await writeNodeFile(path.join(root, 'docs', 'note.txt'), 'hello from ts sdk');

        const signed = await sign('docs/note.txt', {
          identity: 'user:alice',
          metadata: { purpose: 'sdk' },
          basePath: root
        });
        const verified = await verify('docs/note.txt', {
          basePath: root
        });
        const contentSignature = await signContent('signed body', 'user:alice', {
          metadata: { channel: 'sdk' },
          signatureId: 'content-1',
          basePath: root
        });
        const statuses = await fsStatus('docs/*.txt', { basePath: root });

        expect(signed.status).toBe('verified');
        expect(signed.verified).toBe(true);
        expect(signed.signer).toBe('user:alice');
        expect(signed.metadata).toEqual({ purpose: 'sdk' });

        expect(verified.status).toBe('verified');
        expect(verified.verified).toBe(true);
        expect(verified.signer).toBe('user:alice');
        expect(verified.metadata).toEqual({ purpose: 'sdk' });

        expect(contentSignature.id).toBe('content-1');
        expect(contentSignature.signedBy).toBe('user:alice');
        expect(contentSignature.metadata).toEqual({ channel: 'sdk' });
        await access(path.join(root, '.sig', 'content', 'content-1.sig.json'));
        await access(path.join(root, '.sig', 'content', 'content-1.sig.content'));

        expect(statuses).toHaveLength(1);
        expect(statuses[0].relativePath).toBe('docs/note.txt');
        expect(statuses[0].status).toBe('verified');
        expect(statuses[0].signer).toBe('user:alice');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it('should handle exe directive', async () => {
      const content = `
/exe @greeting = run {echo "Hello from exe!"}
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      // Exe directive alone doesn't produce output (just trailing newline from normalizer)
      expect(result).toBe('\n');
    });

    it('should handle simple literal show', async () => {
      const content = '/show "This is literal text"';
      const result = await processMlld(content);
      expect(result.trim()).toBe('This is literal text');
    });

    it('should handle multiple show directives', async () => {
      const content = `
/show "Line 1"
/show "Line 2"
/show "Line 3"
      `.trim();
      const result = await processMlld(content);
      const lines = result.trim().split('\n').filter(l => l.length > 0);
      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('defaults raw strings to strict mode', async () => {
      await expect(processMlld('plain text')).rejects.toThrow('Text content not allowed in strict mode (.mld). Use .mld.md for prose.');
    });

    it('allows markdown mode override for raw strings', async () => {
      const result = await processMlld('plain text', { mode: 'markdown' });
      expect(result.trim()).toBe('plain text');
    });

    it('infers strict mode for .mld files and runs bare directives', async () => {
      const content = `
var @name = "World"
show @name
      `.trim();
      await fileSystem.writeFile('/module.mld', content);
      const result = await processMlld(content, {
        filePath: '/module.mld',
        fileSystem,
        pathService
      });
      expect(result.trim()).toBe('World');
    });

    it('treats bare directives as text in markdown mode for .mld.md files', async () => {
      const content = `
var @name = "World"
show @name
      `.trim();
      await fileSystem.writeFile('/module.mld.md', content);
      const result = await processMlld(content, {
        filePath: '/module.mld.md',
        fileSystem,
        pathService
      });
      expect(result.trim()).not.toBe('World');
      expect(result).toContain('show @name');
    });

    it('keeps output writes shadowed when processMlld runs on VirtualFS', async () => {
      const backing = new MemoryFileSystem();
      await backing.mkdir('/project', { recursive: true });
      const vfs = VirtualFS.over(backing);

      const content = [
        '/output "vfs-content" to "/project/out.txt"',
        '/show "ok"'
      ].join('\n');

      const result = await processMlld(content, {
        fileSystem: vfs,
        pathService,
        filePath: '/project/main.mld'
      });

      expect(result.trim()).toBe('ok');
      expect(await backing.exists('/project/out.txt')).toBe(false);
      expect(await vfs.readFile('/project/out.txt')).toBe('vfs-content');

      await vfs.flush('/project/out.txt');
      expect(await backing.readFile('/project/out.txt')).toBe('vfs-content');
    });

    it('exports VirtualFS on SDK surface and package exports include ./sdk', async () => {
      const vfs = VirtualFS.empty();
      expect(vfs.isVirtual()).toBe(true);

      const packageJson = JSON.parse(
        await readFile(path.resolve(process.cwd(), 'package.json'), 'utf8')
      ) as { exports?: Record<string, unknown> };
      expect(packageJson.exports).toBeDefined();
      expect(packageJson.exports).toHaveProperty('./sdk');
    });
  });
});
