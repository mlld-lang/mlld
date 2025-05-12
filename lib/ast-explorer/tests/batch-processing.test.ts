/**
 * Tests for the batch processing functionality
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { setupTestFileSystem } from './utils/FsManager';
import { TracedAdapter } from './TracedAdapter';
import { processBatch, processExampleDirs } from '../src/batch.js';

// Mock parseDirective for consistent test results
vi.mock('../src/parse', () => ({
  parseDirective: vi.fn((directive: string) => {
    // Simple mock implementation to generate different nodes based on directive content
    if (directive.includes('@text')) {
      return {
        type: 'Directive',
        kind: 'text',
        subtype: directive.includes('template') ? 'textTemplate' : 'textAssignment',
        values: {
          name: 'greeting',
          value: 'Hello, world!'
        },
        raw: {
          name: 'greeting',
          value: '"Hello, world!"'
        },
        meta: {
          sourceType: 'literal'
        }
      };
    } else if (directive.includes('@run')) {
      return {
        type: 'Directive',
        kind: 'run',
        subtype: 'runCommand',
        values: {
          command: 'echo "Testing"'
        },
        raw: {
          command: 'echo "Testing"'
        },
        meta: {
          sourceType: 'literal'
        }
      };
    } else if (directive.includes('@data')) {
      return {
        type: 'Directive',
        kind: 'data',
        subtype: 'dataAssignment',
        values: {
          name: 'config',
          value: { greeting: 'Hello', count: 42 }
        },
        raw: {
          name: 'config',
          value: '{ greeting: "Hello", count: 42 }'
        },
        meta: {
          sourceType: 'literal'
        }
      };
    }
    
    // Default fallback
    return {
      type: 'Directive',
      kind: 'unknown',
      subtype: 'unknownType',
      values: {},
      raw: {},
      meta: {}
    };
  }),
  parseFile: vi.fn(() => ({ type: 'File', body: [] }))
}));

// Mock the directive extraction
vi.mock('../src/extract-directives', () => ({
  extractDirectives: vi.fn((content: string) => {
    // Simple extraction implementation for testing
    const directives: string[] = [];
    const regex = /@(text|run|data)\s[^\n]+/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      directives.push(match[0]);
    }
    
    return directives.length > 0 ? directives : ['@text greeting = "Hello, world!"'];
  })
}));

describe('Batch Processing', () => {
  let fsAdapter: TracedAdapter;
  let cleanup: () => Promise<void>;
  
  beforeEach(() => {
    // Set up test environment with isolated filesystem
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AST = 'true';
    
    // Create isolated filesystem for testing
    const setup = setupTestFileSystem();
    fsAdapter = setup.fsAdapter;
    cleanup = setup.cleanup;
    
    // Create necessary test directory structure
    fsAdapter.mkdirSync('project/examples', { recursive: true });
    fsAdapter.mkdirSync('project/examples/text/assignment', { recursive: true });
    fsAdapter.mkdirSync('project/examples/text/template', { recursive: true });
    fsAdapter.mkdirSync('project/examples/run/command', { recursive: true });
    fsAdapter.mkdirSync('project/output', { recursive: true });
    
    // Create test files
    fsAdapter.writeFileSync(
      'project/examples/text/assignment/example.md',
      '@text greeting = "Hello, world!"'
    );
    fsAdapter.writeFileSync(
      'project/examples/text/assignment/expected.md',
      'Hello, world!'
    );
    fsAdapter.writeFileSync(
      'project/examples/text/template/example.md',
      '@text template = [[Template with {{var}}]]'
    );
    fsAdapter.writeFileSync(
      'project/examples/run/command/example.md',
      '@run echo "Testing"'
    );
    
    // Reset call tracing
    fsAdapter.resetCalls();
  });
  
  afterEach(async () => {
    // Clean up after tests
    await cleanup();
    
    // Reset environment
    delete process.env.NODE_ENV;
    delete process.env.MOCK_AST;
    
    vi.restoreAllMocks();
  });
  
  describe('processBatch', () => {
    it('should process a batch of examples', () => {
      // Setup test examples
      const examples = [
        { name: 'text-assignment', directive: '@text greeting = "Hello, world!"' },
        { name: 'text-template', directive: '@text template = [[Template with {{var}}]]' },
        { name: 'run-command', directive: '@run echo "Testing"' }
      ];
      
      // Run batch processing with traced adapter
      processBatch(examples, './output', fsAdapter);
      
      // Check if output directories were created
      expect(fsAdapter.existsSync('project/output/types')).toBe(true);
      expect(fsAdapter.existsSync('project/output/tests')).toBe(true);
      expect(fsAdapter.existsSync('project/output/snapshots')).toBe(true);
      
      // Check if files were created (at least one of each type)
      const typeFiles = fsAdapter.readdirSync('project/output/types');
      const snapshotFiles = fsAdapter.readdirSync('project/output/snapshots');
      const testFiles = fsAdapter.readdirSync('project/output/tests');
      
      // Verify we have created files
      expect(typeFiles.length).toBeGreaterThan(0);
      expect(snapshotFiles.length).toBeGreaterThan(0);
      expect(testFiles.length).toBeGreaterThan(0);
      
      // Check for the presence of specific files
      const typeIndex = fsAdapter.existsSync('project/output/types/index.ts');
      const directivesUnion = fsAdapter.existsSync('project/output/types/directives.ts');
      
      expect(typeIndex).toBe(true);
      expect(directivesUnion).toBe(true);
    });
  });
  
  describe('processExampleDirs', () => {
    it('should process examples from a convention-based directory structure', () => {
      // Process the example directories created in beforeEach
      processExampleDirs('./examples', './output', fsAdapter);
      
      // Check if output directories were created
      expect(fsAdapter.existsSync('project/output/types')).toBe(true);
      expect(fsAdapter.existsSync('project/output/snapshots')).toBe(true);
      expect(fsAdapter.existsSync('project/output/e2e')).toBe(true);
      
      // For debugging
      fsAdapter.printCalls();
      
      // Check if files were created
      const typeFiles = fsAdapter.existsSync('project/output/types') ? 
        fsAdapter.readdirSync('project/output/types') : [];
      const snapshotFiles = fsAdapter.existsSync('project/output/snapshots') ? 
        fsAdapter.readdirSync('project/output/snapshots') : [];
      const e2eFiles = fsAdapter.existsSync('project/output/e2e') ?
        fsAdapter.readdirSync('project/output/e2e') : [];
      
      // Check for specific aspects of type generation
      if (typeFiles.length > 0) {
        // Verify we have discriminated union types
        const textTypeExists = typeFiles.some(file => file === 'text.ts');
        const runTypeExists = typeFiles.some(file => file === 'run.ts');
        
        expect(textTypeExists || runTypeExists).toBe(true);
      }
      
      // Check for presence of snapshots
      expect(snapshotFiles.length).toBeGreaterThan(0);
      
      // Check for E2E fixtures when expected files are present
      expect(e2eFiles.length).toBeGreaterThan(0);
    });
    
    it('should gracefully handle missing directories', () => {
      // Process examples from a non-existent directory
      processExampleDirs('./non-existent', './output', fsAdapter);
      
      // Should not throw an error and should create output directories
      expect(fsAdapter.existsSync('project/output')).toBe(true);
      expect(fsAdapter.existsSync('project/output/types')).toBe(true);
      expect(fsAdapter.existsSync('project/output/snapshots')).toBe(true);
    });
  });
});