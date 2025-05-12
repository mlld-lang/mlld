/**
 * Tests for the E2E fixture generation functionality
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { setupTestFileSystem } from './utils/FsManager';
import { TracedAdapter } from './TracedAdapter';
import { processEnhancedExampleDirs } from '../src/enhanced-batch';

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

// Mock parseDirective for consistent test results
vi.mock('../src/parse', () => ({
  parseDirective: vi.fn((directive: string) => {
    // Return different node structures based on directive kind
    if (directive.includes('@text')) {
      return {
        type: 'Directive',
        kind: 'text',
        subtype: directive.includes('template') ? 'textTemplate' : 'textAssignment',
        values: {
          name: directive.split('=')[0].trim().split(' ')[1],
          value: directive.includes('template') ? [{ type: 'Text', content: 'Template content' }] : 'Hello, world!'
        },
        raw: {
          name: directive.split('=')[0].trim().split(' ')[1],
          value: directive.includes('template') ? '[[Template content]]' : '"Hello, world!"'
        },
        meta: {
          sourceType: directive.includes('template') ? 'template' : 'literal'
        }
      };
    } else if (directive.includes('@run')) {
      return {
        type: 'Directive',
        kind: 'run',
        subtype: 'runCommand',
        values: {
          command: directive.split('@run ')[1].trim()
        },
        raw: {
          command: directive.split('@run ')[1].trim()
        },
        meta: {
          sourceType: 'literal'
        }
      };
    } else {
      // Default fallback
      return {
        type: 'Directive',
        kind: 'unknown',
        subtype: 'unknownType',
        values: {},
        raw: {},
        meta: {}
      };
    }
  }),
  parseFile: vi.fn(() => ({ type: 'File', body: [] }))
}));

describe('E2E Fixture Generation', () => {
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
    // with conventional layout for testing
    fsAdapter.mkdirSync('project/examples/text/assignment', { recursive: true });
    fsAdapter.mkdirSync('project/examples/text/template', { recursive: true });
    fsAdapter.mkdirSync('project/examples/run/command', { recursive: true });
    fsAdapter.mkdirSync('project/output', { recursive: true });
    
    // Create example files with directives and expected outputs
    fsAdapter.writeFileSync(
      'project/examples/text/assignment/example.md',
      '@text greeting = "Hello, world!"'
    );
    fsAdapter.writeFileSync(
      'project/examples/text/assignment/expected.md',
      'Hello, world!'
    );
    
    // Add a variant example
    fsAdapter.writeFileSync(
      'project/examples/text/assignment/example-multiline.md',
      '@text greeting = "Hello,\\nworld!"'
    );
    fsAdapter.writeFileSync(
      'project/examples/text/assignment/expected-multiline.md',
      'Hello,\nworld!'
    );
    
    // Template example
    fsAdapter.writeFileSync(
      'project/examples/text/template/example.md',
      '@text template = [[Template with {{var}}]]'
    );
    fsAdapter.writeFileSync(
      'project/examples/text/template/expected.md',
      'Template with value'
    );
    
    // Run command example
    fsAdapter.writeFileSync(
      'project/examples/run/command/example.md',
      '@run echo "Testing"'
    );
    fsAdapter.writeFileSync(
      'project/examples/run/command/expected.md',
      'Testing'
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
  
  it('should generate E2E fixtures from conventional directory structure', () => {
    // Process the examples
    processEnhancedExampleDirs('./examples', './output', fsAdapter);
    
    // Verify E2E fixtures directory was created
    expect(fsAdapter.existsSync('project/output/e2e')).toBe(true);
    
    // Get list of generated fixture files
    const fixtureFiles = fsAdapter.existsSync('project/output/e2e') ?
      fsAdapter.readdirSync('project/output/e2e') : [];
    
    // Verify we have the expected number of fixtures
    // We should have one for each example with an expected output
    expect(fixtureFiles.length).toBeGreaterThan(0);
    
    // Verify specific fixtures were created
    const textAssignmentFixture = fixtureFiles.find(f => f.includes('text-assignment'));
    const textAssignmentVariantFixture = fixtureFiles.find(f => f.includes('multiline'));
    const textTemplateFixture = fixtureFiles.find(f => f.includes('text-template'));
    const runCommandFixture = fixtureFiles.find(f => f.includes('run-command'));
    
    expect(textAssignmentFixture).toBeDefined();
    expect(textAssignmentVariantFixture).toBeDefined();
    expect(textTemplateFixture).toBeDefined();
    expect(runCommandFixture).toBeDefined();
    
    // Verify fixture content structure
    if (textAssignmentFixture) {
      const content = fsAdapter.readFileSync(`project/output/e2e/${textAssignmentFixture}`);
      const fixture = JSON.parse(content);
      
      // Verify fixture has expected structure
      expect(fixture).toHaveProperty('name');
      expect(fixture).toHaveProperty('input');
      expect(fixture).toHaveProperty('expected');
      expect(fixture).toHaveProperty('directives');
      expect(fixture).toHaveProperty('metadata');
      
      // Verify metadata
      expect(fixture.metadata.kind).toBe('text');
      expect(fixture.metadata.subtype).toBe('assignment');
      
      // Verify directives array
      expect(Array.isArray(fixture.directives)).toBe(true);
      expect(fixture.directives.length).toBeGreaterThan(0);
      
      // Verify directive in fixture
      expect(fixture.directives[0]).toContain('@text');
    }
  });
  
  it('should handle variants correctly', () => {
    // Process the examples
    processEnhancedExampleDirs('./examples', './output', fsAdapter);
    
    // Get list of generated fixture files
    const fixtureFiles = fsAdapter.existsSync('project/output/e2e') ?
      fsAdapter.readdirSync('project/output/e2e') : [];
    
    // Find the multiline variant fixture
    const multilineFixture = fixtureFiles.find(f => f.includes('multiline'));
    
    // Verify variant fixture exists
    expect(multilineFixture).toBeDefined();
    
    if (multilineFixture) {
      const content = fsAdapter.readFileSync(`project/output/e2e/${multilineFixture}`);
      const fixture = JSON.parse(content);
      
      // Verify variant metadata
      expect(fixture.metadata.variant).toBe('multiline');
      
      // Verify input contains the variant-specific content
      expect(fixture.input).toContain('Hello,\\nworld!');
    }
  });
  
  it('should generate snapshots for each directive', () => {
    // Process the examples
    processEnhancedExampleDirs('./examples', './output', fsAdapter);
    
    // Verify snapshots directory was created
    expect(fsAdapter.existsSync('project/output/snapshots')).toBe(true);
    
    // Get list of generated snapshot files
    const snapshotFiles = fsAdapter.existsSync('project/output/snapshots') ?
      fsAdapter.readdirSync('project/output/snapshots') : [];
    
    // Verify we have snapshots
    expect(snapshotFiles.length).toBeGreaterThan(0);
    
    // Verify specific snapshots were created
    const textAssignmentSnapshot = snapshotFiles.find(f => f.includes('text-assignment'));
    const textTemplateSnapshot = snapshotFiles.find(f => f.includes('text-template'));
    const runCommandSnapshot = snapshotFiles.find(f => f.includes('run-command'));
    
    expect(textAssignmentSnapshot).toBeDefined();
    expect(textTemplateSnapshot).toBeDefined();
    expect(runCommandSnapshot).toBeDefined();
  });
  
  it('should generate consolidated type files', () => {
    // Process the examples
    processEnhancedExampleDirs('./examples', './output', fsAdapter);
    
    // Verify types directory was created
    expect(fsAdapter.existsSync('project/output/types')).toBe(true);
    
    // Get list of generated type files
    const typeFiles = fsAdapter.existsSync('project/output/types') ?
      fsAdapter.readdirSync('project/output/types') : [];
    
    // Verify we have types
    expect(typeFiles.length).toBeGreaterThan(0);
    
    // Verify union type files were created
    const textUnionFile = typeFiles.find(f => f === 'text.ts');
    const runUnionFile = typeFiles.find(f => f === 'run.ts');
    const directivesUnionFile = typeFiles.find(f => f === 'directives.ts');
    const indexFile = typeFiles.find(f => f === 'index.ts');
    
    expect(textUnionFile).toBeDefined();
    expect(runUnionFile).toBeDefined();
    expect(directivesUnionFile).toBeDefined();
    expect(indexFile).toBeDefined();
  });
});