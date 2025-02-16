import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
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
      const result = await context.fs.readFile('/test.txt');
      expect(result).toBe(content);
    });
  });

  describe('meld parsing', () => {
    it('parses meld content', async () => {
      const content = '@text greeting = "Hello"';
      const ast = await context.parseMeld(content);

      expect(ast).toHaveLength(1);
      expect(ast[0].type).toBe('Directive');
      expect(ast[0].directive).toBeDefined();
      expect(ast[0].directive.kind).toBe('text');
      expect(ast[0].directive.identifier).toBe('greeting');
      expect(ast[0].directive.value).toBe('Hello');
    });

    it('parses meld content with locations', async () => {
      const content = '@text greeting = "Hello"';
      const ast = await context.parseMeldWithLocations(content, 'test.meld');

      expect(ast).toHaveLength(1);
      expect(ast[0].type).toBe('Directive');
      expect(ast[0].directive).toBeDefined();
      expect(ast[0].directive.kind).toBe('text');
      expect(ast[0].directive.identifier).toBe('greeting');
      expect(ast[0].directive.value).toBe('Hello');
      expect(ast[0].location).toBeDefined();
      expect(ast[0].location.start).toBeDefined();
      expect(ast[0].location.end).toBeDefined();
      expect(ast[0].location.filePath).toBe('test.meld');
    });
  });

  describe('xml conversion', () => {
    it('converts content to xml', async () => {
      const content = '# Test\nHello world';
      const xml = await context.convertToXml(content);
      expect(xml).toContain('<Test>');
      expect(xml).toContain('Hello world');
      expect(xml).toContain('</Test>');
    });
  });

  describe('project creation', () => {
    it('creates a basic project structure', async () => {
      await context.createBasicProject();
      expect(await context.fs.exists('/project')).toBe(true);
    });
  });

  describe('snapshot functionality', () => {
    it('takes and compares snapshots', async () => {
      // Initial state
      const before = await context.takeSnapshot();
      
      // Make some changes
      await context.writeFile('test.txt', 'content');
      
      // Take after snapshot
      const after = await context.takeSnapshot();
      
      // Compare
      const diff = context.compareSnapshots(before, after);
      expect(diff.added).toContain('/test.txt');
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('takes snapshots of specific directories', async () => {
      await context.writeFile('dir1/test1.txt', 'content1');
      await context.writeFile('dir2/test2.txt', 'content2');
      
      const snapshot = await context.takeSnapshot('/dir1');
      expect(snapshot.has('/dir1/test1.txt')).toBe(true);
      expect(snapshot.has('/dir2/test2.txt')).toBe(false);
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
      expect(await context.fs.exists('/test.txt')).toBe(true);
      
      // Cleanup
      await context.cleanup();
      
      // Verify cleanup
      expect(await context.fs.exists('/test.txt')).toBe(false);
    });
  });
}); 