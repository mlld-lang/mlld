import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectBuilder } from '../ProjectBuilder';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';

describe('ProjectBuilder', () => {
  let fs: MemfsTestFileSystem;
  let builder: ProjectBuilder;

  beforeEach(() => {
    fs = new MemfsTestFileSystem();
    fs.initialize();
    builder = new ProjectBuilder(fs);
  });

  describe('project creation', () => {
    it('creates a basic project structure', async () => {
      await builder.createBasicProject();
      
      // Verify project structure
      expect(fs.exists('/project')).toBe(true);
      expect(fs.isDirectory('/project')).toBe(true);
    });

    it('creates project from structure object', async () => {
      const structure = {
        dirs: ['test', 'test/nested'],
        files: {
          'test/file1.txt': 'content1',
          'test/nested/file2.txt': 'content2'
        }
      };

      await builder.create(structure);

      // Verify directories
      expect(fs.isDirectory('/project/test')).toBe(true);
      expect(fs.isDirectory('/project/test/nested')).toBe(true);

      // Verify files
      expect(fs.readFile('/project/test/file1.txt')).toBe('content1');
      expect(fs.readFile('/project/test/nested/file2.txt')).toBe('content2');
    });

    it('creates directories even without files', async () => {
      const structure = {
        dirs: ['empty1', 'empty2/nested'],
        files: {}
      };

      await builder.create(structure);

      expect(fs.isDirectory('/project/empty1')).toBe(true);
      expect(fs.isDirectory('/project/empty2/nested')).toBe(true);
    });

    it('creates parent directories automatically for files', async () => {
      const structure = {
        files: {
          'auto/created/dir/file.txt': 'content'
        }
      };

      await builder.create(structure);

      expect(fs.isDirectory('/project/auto')).toBe(true);
      expect(fs.isDirectory('/project/auto/created')).toBe(true);
      expect(fs.isDirectory('/project/auto/created/dir')).toBe(true);
      expect(fs.readFile('/project/auto/created/dir/file.txt')).toBe('content');
    });
  });

  describe('error handling', () => {
    it('handles empty structure gracefully', async () => {
      const structure = {
        files: {}
      };

      await expect(builder.create(structure)).resolves.not.toThrow();
    });

    it('handles undefined dirs gracefully', async () => {
      const structure = {
        files: {
          'test.txt': 'content'
        }
      };

      await expect(builder.create(structure)).resolves.not.toThrow();
      expect(fs.readFile('/project/test.txt')).toBe('content');
    });
  });

  describe('file operations', () => {
    it('overwrites existing files', async () => {
      // First creation
      await builder.create({
        files: {
          'test.txt': 'original'
        }
      });

      // Second creation
      await builder.create({
        files: {
          'test.txt': 'updated'
        }
      });

      expect(fs.readFile('/project/test.txt')).toBe('updated');
    });

    it('preserves existing directories when creating new ones', async () => {
      // First creation
      await builder.create({
        dirs: ['existing'],
        files: {
          'existing/old.txt': 'old content'
        }
      });

      // Second creation with new directory
      await builder.create({
        dirs: ['existing', 'new'],
        files: {
          'new/new.txt': 'new content'
        }
      });

      expect(fs.exists('/project/existing/old.txt')).toBe(true);
      expect(fs.readFile('/project/existing/old.txt')).toBe('old content');
      expect(fs.readFile('/project/new/new.txt')).toBe('new content');
    });
  });

  describe('path handling', () => {
    it('normalizes file paths', async () => {
      const structure = {
        files: {
          './test.txt': 'content1',
          'dir/../file.txt': 'content2'
        }
      };

      await builder.create(structure);

      expect(fs.readFile('/project/test.txt')).toBe('content1');
      expect(fs.readFile('/project/file.txt')).toBe('content2');
    });

    it('normalizes directory paths', async () => {
      const structure = {
        dirs: ['./dir1', 'dir2/./nested'],
        files: {}
      };

      await builder.create(structure);

      expect(fs.isDirectory('/project/dir1')).toBe(true);
      expect(fs.isDirectory('/project/dir2/nested')).toBe(true);
    });
  });
}); 