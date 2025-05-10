import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { TracedAdapter } from './TracedAdapter';
import { MemfsAdapter } from './MemfsAdapter';
import { Explorer } from '../src/explorer';

// Skip these tests until the monkey-patching issue is fixed
describe.skip('AST Explorer Comprehensive Tests', () => {
  const testOutputDir = './test-output';
  const snapshotsDir = './test-output/snapshots';
  const typesDir = './test-output/types';
  const fixturesDir = './test-output/fixtures';
  
  let memfsAdapter: MemfsAdapter;
  let fsAdapter: TracedAdapter;
  let explorer: Explorer;
  
  beforeEach(() => {
    // Set up test environment - don't patch fs as it's already patched 
    // in the other test file
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AST = 'true';
    
    // Create filesystem adapters
    memfsAdapter = new MemfsAdapter();
    fsAdapter = new TracedAdapter(memfsAdapter);
    
    // Create directories in memfs
    fsAdapter.mkdirSync('project/test-output', { recursive: true });
    fsAdapter.mkdirSync('project/test-output/snapshots', { recursive: true });
    fsAdapter.mkdirSync('project/test-output/types', { recursive: true });
    fsAdapter.mkdirSync('project/test-output/fixtures', { recursive: true });
    
    // Create explorer instance
    explorer = new Explorer({
      outputDir: testOutputDir,
      snapshotsDir: snapshotsDir,
      typesDir: typesDir,
      fileSystem: fsAdapter
    });
    
    // Reset call history
    fsAdapter.resetCalls();
  });
  
  afterEach(async () => {
    // Clean up
    await memfsAdapter.cleanup();
    
    // Reset environment
    delete process.env.NODE_ENV;
    delete process.env.MOCK_AST;
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
      const directive = '@data config = { greeting: "Hello", count: 42, nested: { key: "value" } }';
      const ast = explorer.parseDirective(directive);
      
      expect(ast).toBeDefined();
      expect(ast.type).toBe('Directive');
      expect(ast.kind).toBe('data');
      expect(ast.values.name).toBe('config');
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