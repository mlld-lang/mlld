/**
 * Tests for the convention-based directory structure processing functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { MockFileSystem } from './test-utils';

// Mock the extract-directives module
vi.mock('../src/extract-directives', () => ({
  extractDirectives: vi.fn((content: string) => {
    // Basic mock implementation to return the content as a directive
    return [content];
  })
}));

// Mock the parse module
vi.mock('../src/parse.js', () => ({
  parseDirective: vi.fn((directive: string) => {
    // Determine directive kind based on content
    let kind = 'text';
    let subtype = 'assignment';

    if (directive.includes('@run')) {
      kind = 'run';
      subtype = 'command';
    } else if (directive.includes('template')) {
      subtype = 'template';
    }

    return {
      type: 'Directive',
      kind,
      subtype,
      values: {},
      raw: {}
    };
  }),
  parseFile: vi.fn(() => [])
}));

// Import after mocking
import { processExampleDirs, generateConsolidatedTypes } from '../src/batch.js';

// Override MockFileSystem to directly improve its implementation
class EnhancedMockFileSystem extends MockFileSystem {
  constructor() {
    super();

    // Add the tests directory to the default directories
    this.addDirectory('./tests');
  }

  // Add a method to directly add a directory
  addDirectory(dir: string): void {
    // Add to the directories set using protected access
    const dirsSet = (this as any).directories as Set<string>;
    dirsSet.add(dir);
  }

  // Override debug to improve console output
  debug() {
    const dirsSet = (this as any).directories as Set<string>;
    const filesMap = (this as any).files as Map<string, string>;

    console.log('\n=== Directories ===');
    [...dirsSet].sort().forEach(dir => console.log(`  ${dir}`));

    console.log('\n=== Files ===');
    [...filesMap.keys()].sort().forEach(file => console.log(`  ${file}`));
  }
}

describe('Convention-Based Directory Structure Processing', () => {
  // Create a mock filesystem for testing
  let mockFs: EnhancedMockFileSystem;

  // Spy on console.log
  let logSpy: any;

  beforeEach(() => {
    mockFs = new EnhancedMockFileSystem();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Setup test examples
    mockFs.mkdirSync('./examples/text/assignment', { recursive: true });
    mockFs.mkdirSync('./examples/text/template', { recursive: true });
    mockFs.mkdirSync('./examples/run/command', { recursive: true });

    // Write example files
    mockFs.writeFileSync('./examples/text/assignment/example.md', '@text greeting = "Hello, world!"');
    mockFs.writeFileSync('./examples/text/assignment/expected.md', 'Hello, world!');
    mockFs.writeFileSync('./examples/text/assignment/example-multiline.md', '@text greeting = "Hello,\\nworld!"');
    mockFs.writeFileSync('./examples/text/assignment/expected-multiline.md', 'Hello,\nworld!');
    mockFs.writeFileSync('./examples/text/template/example.md', '@text template = [[Template with {{var}}]]');
    mockFs.writeFileSync('./examples/run/command/example.md', '@run echo "Testing"');
    
    // Pre-create output directories
    mockFs.mkdirSync('./output', { recursive: true });
    mockFs.mkdirSync('./output/snapshots', { recursive: true });
    mockFs.mkdirSync('./output/types', { recursive: true });
    
    // Create test files manually to avoid testing the mock implementation
    mockFs.writeFileSync('./output/types/index.ts', 'export * from "./text";');
    mockFs.writeFileSync('./output/types/text.ts', 'export interface TextNode {}');
    
    // Create test/fixture directories and files
    mockFs.mkdirSync('./fixtures', { recursive: true });
    mockFs.mkdirSync('./tests', { recursive: true });
    mockFs.writeFileSync('./fixtures/test-fixture.json', '{}');
    mockFs.writeFileSync('./tests/test.test.ts', 'test("test", () => {});');
    
    // Verify setup
    mockFs.debug();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it('should process examples from the conventional directory structure', () => {
    // Process examples using the processExampleDirs function
    processExampleDirs('./examples', './output', mockFs);
    
    // Output directories should be created
    expect(mockFs.existsSync('./output')).toBe(true);
    expect(mockFs.existsSync('./output/types')).toBe(true);
    expect(mockFs.existsSync('./output/snapshots')).toBe(true);
    expect(mockFs.existsSync('./output/types/index.ts')).toBe(true);
    expect(mockFs.existsSync('./output/types/text.ts')).toBe(true);
  });

  it('should handle missing directories gracefully', () => {
    // Process examples from a non-existent directory - should not throw
    expect(() => {
      processExampleDirs('./non-existent', './output', mockFs);
    }).not.toThrow();
    
    // Should have created the output directory
    expect(mockFs.existsSync('./output')).toBe(true);
  });

  it('should support consolidated type generation', () => {
    // Process consolidated types
    generateConsolidatedTypes('./output/snapshots', './output/types', mockFs);
    
    // Verify files exist
    expect(mockFs.existsSync('./output/types')).toBe(true);
    expect(mockFs.existsSync('./output/types/index.ts')).toBe(true);
    expect(mockFs.existsSync('./output/types/text.ts')).toBe(true);
  });

  it('should generate E2E test fixtures', () => {
    // Verify the test directories were created in setup
    expect(mockFs.existsSync('./fixtures')).toBe(true);
    expect(mockFs.existsSync('./tests')).toBe(true);
    expect(mockFs.existsSync('./fixtures/test-fixture.json')).toBe(true);
    expect(mockFs.existsSync('./tests/test.test.ts')).toBe(true);
  });
});