/**
 * Tests for the enhanced type generation functionality
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { setupTestFileSystem } from './utils/FsManager';
import { TracedAdapter } from './TracedAdapter';
import { generateEnhancedTypes } from '../src/generate/enhanced-types';

describe('Enhanced Type Generation', () => {
  let fsAdapter: TracedAdapter;
  let cleanup: () => Promise<void>;
  
  // Mock directive nodes for testing
  const mockDirectives = [
    // Text assignment
    {
      type: 'Directive',
      kind: 'text',
      subtype: 'textAssignment',
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
    },
    // Text template
    {
      type: 'Directive',
      kind: 'text',
      subtype: 'textTemplate',
      values: {
        name: 'template',
        content: [
          { type: 'Text', content: 'Template with ' },
          { type: 'VariableReference', identifier: 'var' }
        ]
      },
      raw: {
        name: 'template',
        content: '[[Template with {{var}}]]'
      },
      meta: {
        sourceType: 'template'
      }
    },
    // Run command
    {
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
    },
    // Data directive
    {
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
    }
  ];
  
  beforeEach(() => {
    // Set up test environment with isolated filesystem
    process.env.NODE_ENV = 'test';
    
    // Create isolated filesystem for testing
    const setup = setupTestFileSystem();
    fsAdapter = setup.fsAdapter;
    cleanup = setup.cleanup;
    
    // Create output directory for tests
    fsAdapter.mkdirSync('project/output/types', { recursive: true });
    
    // Reset call tracking
    fsAdapter.resetCalls();
  });
  
  afterEach(async () => {
    // Cleanup after tests
    await cleanup();
    
    // Reset environment
    delete process.env.NODE_ENV;
    
    vi.restoreAllMocks();
  });
  
  it('should generate base type files', () => {
    // Generate enhanced types
    generateEnhancedTypes(mockDirectives, './output/types', fsAdapter);
    
    // Check if base types were generated
    expect(fsAdapter.existsSync('project/output/types/base-node.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/base-directive.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/base-variable.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/values.ts')).toBe(true);
    
    // Verify content of base types
    if (fsAdapter.existsSync('project/output/types/base-node.ts')) {
      const content = fsAdapter.readFileSync('project/output/types/base-node.ts');
      expect(content).toContain('interface BaseNode');
      expect(content).toContain('interface TextNode extends BaseNode');
    }
  });
  
  it('should generate directive subtype interfaces', () => {
    // Generate enhanced types
    generateEnhancedTypes(mockDirectives, './output/types', fsAdapter);
    
    // Check if specific directive type files were generated
    expect(fsAdapter.existsSync('project/output/types/text-text-assignment.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/text-text-template.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/run-run-command.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/data-data-assignment.ts')).toBe(true);
    
    // Verify content of directive type files
    if (fsAdapter.existsSync('project/output/types/text-text-assignment.ts')) {
      const content = fsAdapter.readFileSync('project/output/types/text-text-assignment.ts');
      expect(content).toContain('export interface TextTextAssignmentDirectiveNode');
      expect(content).toContain('extends TypedDirectiveNode<\'text\', \'textAssignment\'>');
      expect(content).toContain('values: {');
      expect(content).toContain('function isTextTextAssignmentDirectiveNode');
    }
  });
  
  it('should generate discriminated union types', () => {
    // Generate enhanced types
    generateEnhancedTypes(mockDirectives, './output/types', fsAdapter);
    
    // Check if union type files were generated
    expect(fsAdapter.existsSync('project/output/types/text.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/run.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/data.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/directives.ts')).toBe(true);
    
    // Verify content of union type files
    if (fsAdapter.existsSync('project/output/types/text.ts')) {
      const content = fsAdapter.readFileSync('project/output/types/text.ts');
      expect(content).toContain('export type TextDirectiveNode =');
      expect(content).toContain('| TextTextAssignmentDirectiveNode');
      expect(content).toContain('| TextTextTemplateDirectiveNode');
    }
    
    if (fsAdapter.existsSync('project/output/types/directives.ts')) {
      const content = fsAdapter.readFileSync('project/output/types/directives.ts');
      expect(content).toContain('export type DirectiveNodeUnion =');
      expect(content).toContain('| TextDirectiveNode');
      expect(content).toContain('| RunDirectiveNode');
      expect(content).toContain('| DataDirectiveNode');
    }
  });
  
  it('should generate an index file with all exports', () => {
    // Generate enhanced types
    generateEnhancedTypes(mockDirectives, './output/types', fsAdapter);
    
    // Check if index file was generated
    expect(fsAdapter.existsSync('project/output/types/index.ts')).toBe(true);
    
    // Verify content of index file
    if (fsAdapter.existsSync('project/output/types/index.ts')) {
      const content = fsAdapter.readFileSync('project/output/types/index.ts');
      expect(content).toContain('export * from \'./base-node.js\'');
      expect(content).toContain('export * from \'./directives.js\'');
      expect(content).toContain('export * from \'./text.js\'');
      expect(content).toContain('export * from \'./run.js\'');
      expect(content).toContain('export * from \'./data.js\'');
      expect(content).toContain('export * from \'./text-text-assignment.js\'');
    }
  });
});