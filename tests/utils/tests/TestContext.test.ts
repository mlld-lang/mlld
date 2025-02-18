import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import type { DirectiveNode } from 'meld-spec';
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
      expect(newContext.fixtures.load).toBeInstanceOf(Function);
    });

    it('initializes with custom fixtures directory', () => {
      const newContext = new TestContext('custom/fixtures');
      expect(newContext.fixtures.load).toBeInstanceOf(Function);
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
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive).toEqual({
        kind: 'text',
        identifier: 'greeting',
        source: 'literal',
        value: 'Hello'
      });
    });

    it('parses meld content with locations', async () => {
      const content = '@text greeting = "Hello"';
      const ast = await context.parseMeldWithLocations(content, 'test.meld');

      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive).toEqual({
        kind: 'text',
        identifier: 'greeting',
        source: 'literal',
        value: 'Hello'
      });
      expect(node.location).toEqual({
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length + 1 }
      });
    });
  });

  describe('xml conversion', () => {
    it('converts content to xml', async () => {
      const content = '# Test\nHello world';
      const xml = await context.toXML(content);
      expect(xml).toBe('<Test>\nHello world\n</Test>');
    });
  });

  describe('project creation', () => {
    it('creates a basic project structure', async () => {
      await context.createBasicProject();
      // Check for specific required directories
      expect(await context.fs.exists('/project')).toBe(true);
      expect(await context.fs.exists('/project/src')).toBe(true);
      expect(await context.fs.exists('/project/nested')).toBe(true);
      expect(await context.fs.exists('/project/shared')).toBe(true);
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
      expect(diff.added).toEqual(['/test.txt']);
      expect(diff.removed).toEqual([]);
      expect(diff.modified).toEqual([]);
    });

    it('takes snapshots of specific directories', async () => {
      await context.writeFile('dir1/test1.txt', 'content1');
      await context.writeFile('dir2/test2.txt', 'content2');
      
      const snapshot = await context.takeSnapshot('/dir1');
      expect(snapshot.has('/dir1/test1.txt')).toBe(true);
      expect(snapshot.has('/dir2/test2.txt')).toBe(false);
      expect(snapshot.get('/dir1/test1.txt')).toBe('content1');
    });
  });

  describe('test factories', () => {
    it('provides access to test factories', () => {
      // Check for specific required factory functions
      expect(typeof context.factory.createTextNode).toBe('function');
      expect(typeof context.factory.createDirectiveNode).toBe('function');
      expect(typeof context.factory.createCodeFenceNode).toBe('function');
      expect(typeof context.factory.createLocation).toBe('function');
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
      expect(await context.fs.exists('/project')).toBe(false);
    });
  });
}); 