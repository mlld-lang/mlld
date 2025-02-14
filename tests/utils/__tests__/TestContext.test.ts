import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '../TestContext';
import * as path from 'path';

describe('TestContext', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('initialization', () => {
    it('initializes with default fixtures directory', () => {
      const newContext = new TestContext();
      expect(newContext.fixtures).toBeDefined();
    });

    it('initializes with custom fixtures directory', () => {
      const newContext = new TestContext('custom/fixtures');
      expect(newContext.fixtures).toBeDefined();
    });
  });

  describe('file operations', () => {
    it('writes and reads files', async () => {
      const content = 'test content';
      await context.writeFile('test.txt', content);
      const result = context.fs.readFile('/project/test.txt');
      expect(result).toBe(content);
    });
  });

  describe('meld parsing', () => {
    it('parses meld content', () => {
      const content = '@text greeting = "Hello"';
      const ast = context.parseMeld(content);
      expect(ast).toBeDefined();
      expect(Array.isArray(ast)).toBe(true);
      expect(ast.length).toBe(1);
      expect(ast[0].type).toBe('directive');
    });
  });

  describe('xml conversion', () => {
    it('converts content to xml', () => {
      const content = '# Test\nHello world';
      const xml = context.convertToXml(content);
      expect(xml).toContain('<heading>Test</heading>');
      expect(xml).toContain('Hello world');
    });
  });

  describe('project creation', () => {
    it('creates a basic project structure', async () => {
      await context.createBasicProject();
      expect(context.fs.exists('/project')).toBe(true);
    });
  });

  describe('snapshot functionality', () => {
    it('takes and compares snapshots', async () => {
      // Initial state
      const before = context.takeSnapshot();
      
      // Make some changes
      await context.writeFile('test.txt', 'content');
      
      // Take after snapshot
      const after = context.takeSnapshot();
      
      // Compare
      const diff = context.compareSnapshots(before, after);
      expect(diff.added).toContain('/project/test.txt');
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('takes snapshots of specific directories', async () => {
      await context.writeFile('dir1/test1.txt', 'content1');
      await context.writeFile('dir2/test2.txt', 'content2');
      
      const snapshot = context.takeSnapshot('/project/dir1');
      expect(snapshot.has('/project/dir1/test1.txt')).toBe(true);
      expect(snapshot.has('/project/dir2/test2.txt')).toBe(false);
    });
  });

  describe('test factories', () => {
    it('provides access to test factories', () => {
      expect(context.factory).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('cleans up resources properly', async () => {
      // Create some test files
      await context.writeFile('test.txt', 'content');
      expect(context.fs.exists('/project/test.txt')).toBe(true);
      
      // Cleanup
      await context.cleanup();
      
      // Verify cleanup
      expect(context.fs.exists('/project/test.txt')).toBe(false);
    });
  });
}); 