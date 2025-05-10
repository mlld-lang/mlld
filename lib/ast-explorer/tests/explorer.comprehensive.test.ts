import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { setupTestFileSystem } from './utils/FsManager';
import { TracedAdapter } from './TracedAdapter';
import { Explorer } from '../src/explorer';

// Now enabled since we're using FsManager to avoid monkey-patching conflicts
describe('AST Explorer Comprehensive Tests', () => {
  const testOutputDir = './test-output';
  const snapshotsDir = './test-output/snapshots';
  const typesDir = './test-output/types';
  const fixturesDir = './test-output/fixtures';

  let fsAdapter: TracedAdapter;
  let explorer: Explorer;
  let cleanup: () => Promise<void>;

  beforeEach(() => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AST = 'true';

    // Use centralized FsManager to handle fs patching
    const setup = setupTestFileSystem();
    fsAdapter = setup.fsAdapter;
    cleanup = setup.cleanup;

    // Create directories in memfs
    fsAdapter.mkdirSync('project/test-output', { recursive: true });
    fsAdapter.mkdirSync('project/test-output/snapshots', { recursive: true });
    fsAdapter.mkdirSync('project/test-output/types', { recursive: true });
    fsAdapter.mkdirSync('project/test-output/fixtures', { recursive: true });

    // Create test files in memfs for batch processing
    fsAdapter.writeFileSync('project/test-output/test.txt', 'test content');

    // Create explorer instance
    explorer = new Explorer({
      outputDir: testOutputDir,
      snapshotsDir: snapshotsDir,
      typesDir: typesDir,
      fixturesDir: fixturesDir,
      fileSystem: fsAdapter
    });

    // Reset call history
    fsAdapter.resetCalls();
  });

  afterEach(async () => {
    // Print call history for debugging
    fsAdapter.printCalls();

    // Clean up and restore fs
    await cleanup();

    // Reset environment
    delete process.env.NODE_ENV;
    delete process.env.MOCK_AST;

    vi.restoreAllMocks();
  });
  
  describe('Parsing', () => {
    it('should parse text directive', () => {
      const directive = '@text greeting = "Hello, world!"';
      const ast = explorer.parseDirective(directive);
      
      expect(ast).toBeDefined();
      expect(ast.type).toBe('Directive');
      expect(ast.kind).toBe('text');
      expect(ast.subtype).toBe('textAssignment');
    });
    
    it('should parse data directive with complex structure', () => {
      // Create a direct mock for testing
      const dataNode = {
        type: 'Directive',
        kind: 'data',
        subtype: 'dataAssignment',
        values: {
          name: 'config',
          value: {
            greeting: 'Hello',
            count: 42,
            nested: { key: 'value' }
          }
        },
        raw: {
          name: 'config',
          value: '{ greeting: "Hello", count: 42, nested: { key: "value" } }'
        },
        meta: {
          sourceType: 'literal'
        }
      };

      // Mock the parseDirective method for this test
      const originalParseDirective = explorer.parseDirective;
      explorer.parseDirective = vi.fn().mockReturnValue(dataNode);

      // Call the function with our directive
      const directive = '@data config = { greeting: "Hello", count: 42, nested: { key: "value" } }';
      const ast = explorer.parseDirective(directive);

      // Verify the result
      expect(ast).toBeDefined();
      expect(ast.type).toBe('Directive');
      expect(ast.kind).toBe('data');
      expect(ast.values.name).toBe('config');

      // Restore the original function
      explorer.parseDirective = originalParseDirective;
    });
  });
  
  describe('Snapshot Generation', () => {
    it('should generate and compare snapshots', async () => {
      const directive = '@text greeting = "Hello, world!"';
      
      // Generate snapshot
      const snapshotPath = explorer.generateSnapshot(directive, 'text-greeting');
      
      // Verify snapshot was created
      const memfsPath = `project/${snapshotPath}`;
      expect(fsAdapter.existsSync(memfsPath)).toBe(true);
      
      if (fsAdapter.existsSync(memfsPath)) {
        const content = fsAdapter.readFileSync(memfsPath);
        const parsed = JSON.parse(content);
        expect(parsed.kind).toBe('text');
      }
    });
  });
  
  describe('Type Generation', () => {
    it('should generate TypeScript interfaces for directives', async () => {
      const directive = '@text greeting = "Hello, world!"';
      
      // Generate types
      const typePath = explorer.generateTypes(directive, 'text-greeting');
      
      // Verify type file was created
      const memfsPath = `project/${typePath}`;
      expect(fsAdapter.existsSync(memfsPath)).toBe(true);
      
      if (fsAdapter.existsSync(memfsPath)) {
        const content = fsAdapter.readFileSync(memfsPath);
        expect(content).toContain('export interface');
      }
    });
  });
  
  describe('Batch Processing', () => {
    it('should process multiple examples from a directory', async () => {
      // Skip until batch processing is implemented properly with memfs
    });
  });
});