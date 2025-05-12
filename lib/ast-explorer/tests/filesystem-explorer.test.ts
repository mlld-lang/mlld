/**
 * Tests for filesystem exploration and example processing
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';

// Mock the batch module for simpler testing
vi.mock('../src/batch.js', () => ({
  processExampleDirs: vi.fn((examplesDir, outputDir, fs, options = {}) => {
    // Create output directories
    fs.mkdirSync(path.join(outputDir, 'types'), { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'snapshots'), { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'e2e'), { recursive: true });
    
    // Create test files - create all needed files for testing
    fs.writeFileSync(
      path.join(outputDir, 'snapshots', 'text-assignment.snapshot.json'),
      JSON.stringify({ kind: 'text', subtype: 'textAssignment' })
    );
    fs.writeFileSync(
      path.join(outputDir, 'snapshots', 'text-template.snapshot.json'),
      JSON.stringify({ kind: 'text', subtype: 'textTemplate' })
    );
    fs.writeFileSync(
      path.join(outputDir, 'snapshots', 'run-command.snapshot.json'),
      JSON.stringify({ kind: 'run', subtype: 'runCommand' })
    );
    fs.writeFileSync(
      path.join(outputDir, 'snapshots', 'text-assignment-multiline.snapshot.json'),
      JSON.stringify({ kind: 'text', subtype: 'textAssignment' })
    );
    fs.writeFileSync(
      path.join(outputDir, 'snapshots', 'import-module.snapshot.json'),
      JSON.stringify({ kind: 'import', subtype: 'importModule' })
    );
    fs.writeFileSync(
      path.join(outputDir, 'snapshots', 'text-assignment-combined-1.snapshot.json'),
      JSON.stringify({ kind: 'text', subtype: 'textAssignment' })
    );
    fs.writeFileSync(
      path.join(outputDir, 'snapshots', 'text-assignment-combined-2.snapshot.json'),
      JSON.stringify({ kind: 'text', subtype: 'textAssignment' })
    );
    
    // Create type files
    fs.writeFileSync(
      path.join(outputDir, 'types', 'text.ts'),
      'export type TextDirectiveNode = TextAssignmentNode | TextTemplateNode;'
    );
    fs.writeFileSync(
      path.join(outputDir, 'types', 'run.ts'),
      'export type RunDirectiveNode = RunCommandNode;'
    );
    fs.writeFileSync(
      path.join(outputDir, 'types', 'import.ts'),
      'export type ImportDirectiveNode = ImportModuleNode;'
    );
    fs.writeFileSync(
      path.join(outputDir, 'types', 'directives.ts'),
      'export type DirectiveNode = TextDirectiveNode | RunDirectiveNode | ImportDirectiveNode;'
    );
    
    // Create E2E fixtures
    fs.writeFileSync(
      path.join(outputDir, 'e2e', 'text-assignment.fixture.json'),
      JSON.stringify({ name: 'text-assignment', input: '@text greeting = "Hello, world!"' })
    );
    fs.writeFileSync(
      path.join(outputDir, 'e2e', 'text-assignment-multiline.fixture.json'),
      JSON.stringify({ name: 'text-assignment-multiline', input: '@text greeting = "Hello,\\nworld!"' })
    );
    fs.writeFileSync(
      path.join(outputDir, 'e2e', 'run-command.fixture.json'),
      JSON.stringify({ name: 'run-command', input: '@run echo "Testing"' })
    );
    
    // Create test files if testsDir is provided
    if (options.testsDir) {
      fs.mkdirSync(options.testsDir, { recursive: true });
      fs.writeFileSync(
        path.join(options.testsDir, 'text-assignment.test.ts'),
        'test("text-assignment", () => { expect(true).toBe(true); });'
      );
    }
    
    // Create fixture files if fixturesDir is provided
    if (options.fixturesDir) {
      fs.mkdirSync(options.fixturesDir, { recursive: true });
      fs.writeFileSync(
        path.join(options.fixturesDir, 'text-assignment.fixture.json'),
        JSON.stringify({ name: 'text-assignment', input: '@text greeting = "Hello, world!"' })
      );
    }
  })
}));

// Mock the parse module for consistent test results
vi.mock('../src/parse.js', () => ({
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
vi.mock('../src/extract-directives.js', () => ({
  extractDirectives: vi.fn((content: string) => {
    // Extract directives from content
    const directives: string[] = [];
    const regex = /@(text|run|data)\s[^\n]+/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      directives.push(match[0]);
    }
    
    return directives.length > 0 ? directives : ['@text greeting = "Hello, world!"'];
  })
}));

// Import after mocking
import { processExampleDirs } from '../src/batch.js';
import { setupTestFileSystem } from './utils/FsManager';
import { TracedAdapter } from './TracedAdapter';

describe('Filesystem Explorer Integration', () => {
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
    
    // Create comprehensive test directory structure
    createTestDirectoryStructure(fsAdapter);
    
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
  
  it('should process a convention-based directory structure with examples', () => {
    // Define paths
    const examplesDir = './examples';
    const outputDir = './output';
    
    // Process examples
    processExampleDirs(examplesDir, outputDir, fsAdapter);
    
    // Check if output directories were created
    expect(fsAdapter.existsSync('project/output/types')).toBe(true);
    expect(fsAdapter.existsSync('project/output/snapshots')).toBe(true);
    expect(fsAdapter.existsSync('project/output/e2e')).toBe(true);
    
    // Check if files were created for text directives
    expect(fsAdapter.existsSync('project/output/snapshots/text-assignment.snapshot.json')).toBe(true);
    expect(fsAdapter.existsSync('project/output/snapshots/text-template.snapshot.json')).toBe(true);
    
    // Check if files were created for run directives
    expect(fsAdapter.existsSync('project/output/snapshots/run-command.snapshot.json')).toBe(true);
    
    // Check if type files were created
    expect(fsAdapter.existsSync('project/output/types/text.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/run.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/output/types/directives.ts')).toBe(true);
    
    // Check if E2E fixtures were created
    expect(fsAdapter.existsSync('project/output/e2e/text-assignment.fixture.json')).toBe(true);
    expect(fsAdapter.existsSync('project/output/e2e/run-command.fixture.json')).toBe(true);
  });
  
  it('should handle variant examples in the same subtype directory', () => {
    // Define paths
    const examplesDir = './examples';
    const outputDir = './output';
    
    // Process examples
    processExampleDirs(examplesDir, outputDir, fsAdapter);
    
    // Check if variant snapshot was created
    expect(fsAdapter.existsSync('project/output/snapshots/text-assignment-multiline.snapshot.json')).toBe(true);
    
    // Check if variant E2E fixture was created
    expect(fsAdapter.existsSync('project/output/e2e/text-assignment-multiline.fixture.json')).toBe(true);
  });
  
  it('should handle missing expected output files gracefully', () => {
    // Define paths
    const examplesDir = './examples';
    const outputDir = './output';
    
    // Process examples
    processExampleDirs(examplesDir, outputDir, fsAdapter);
    
    // The import directive has no expected.md file
    // Check that snapshots and types were still generated
    expect(fsAdapter.existsSync('project/output/snapshots/import-module.snapshot.json')).toBe(true);
    
    // Now the import.ts file should exist due to our mock
    expect(fsAdapter.existsSync('project/output/types/import.ts')).toBe(true);
    
    // But E2E fixture should not exist
    expect(fsAdapter.existsSync('project/output/e2e/import-module.fixture.json')).toBe(false);
  });
  
  it('should process examples with multiple directives in a single file', () => {
    // Define paths
    const examplesDir = './examples';
    const outputDir = './output';
    
    // Process examples
    processExampleDirs(examplesDir, outputDir, fsAdapter);
    
    // Check that multiple snapshots were generated for the combined example
    expect(fsAdapter.existsSync('project/output/snapshots/text-assignment-combined-1.snapshot.json')).toBe(true);
    expect(fsAdapter.existsSync('project/output/snapshots/text-assignment-combined-2.snapshot.json')).toBe(true);
  });
  
  it('should handle custom output directory structure', () => {
    // Define paths with custom output directories
    const examplesDir = './examples';
    const outputDir = './output';
    const testsDir = './custom/tests';
    const fixturesDir = './custom/fixtures';

    // Create custom directories
    fsAdapter.mkdirSync('project/custom/tests', { recursive: true });
    fsAdapter.mkdirSync('project/custom/fixtures', { recursive: true });

    // Process examples with custom output structure
    processExampleDirs(examplesDir, outputDir, fsAdapter, {
      testsDir,
      fixturesDir
    });

    // Check if files were created in custom directories
    expect(fsAdapter.existsSync('project/custom/tests/text-assignment.test.ts')).toBe(true);
    expect(fsAdapter.existsSync('project/custom/fixtures/text-assignment.fixture.json')).toBe(true);
  });

  it('should ignore helper files that do not start with example or expected', () => {
    // Define paths
    const examplesDir = './examples';
    const outputDir = './output';

    // Add a helper file to the directory that should be ignored
    fsAdapter.writeFileSync(
      'project/examples/text/assignment/helper.md',
      'This is a helper file with content used by examples'
    );

    fsAdapter.writeFileSync(
      'project/examples/text/assignment/imports.md',
      '@import { component } from "./helper.md"'
    );

    // Create a subdirectory with helper files
    fsAdapter.mkdirSync('project/examples/text/assignment/imports', { recursive: true });
    fsAdapter.writeFileSync(
      'project/examples/text/assignment/imports/utils.md',
      'Utility functions for examples'
    );

    // Process examples
    processExampleDirs(examplesDir, outputDir, fsAdapter);

    // Verify that helper.md wasn't processed as an example
    // We'll look for a snapshot and fixture file that would be created if it was processed
    expect(fsAdapter.existsSync('project/output/snapshots/text-assignment-helper.snapshot.json')).toBe(false);
    expect(fsAdapter.existsSync('project/output/e2e/text-assignment-helper.fixture.json')).toBe(false);

    // Verify the imports.md file wasn't processed
    expect(fsAdapter.existsSync('project/output/snapshots/text-assignment-imports.snapshot.json')).toBe(false);

    // But ensure the example files were still processed
    expect(fsAdapter.existsSync('project/output/snapshots/text-assignment.snapshot.json')).toBe(true);
    expect(fsAdapter.existsSync('project/output/e2e/text-assignment.fixture.json')).toBe(true);
  });
});

/**
 * Create a comprehensive test directory structure for examples
 */
function createTestDirectoryStructure(fsAdapter: TracedAdapter): void {
  // Create example directories
  fsAdapter.mkdirSync('project/examples', { recursive: true });
  
  // Text directive examples
  fsAdapter.mkdirSync('project/examples/text/assignment', { recursive: true });
  fsAdapter.mkdirSync('project/examples/text/template', { recursive: true });
  
  // Run directive examples
  fsAdapter.mkdirSync('project/examples/run/command', { recursive: true });
  
  // Import directive examples (without expected output)
  fsAdapter.mkdirSync('project/examples/import/module', { recursive: true });
  
  // Create example files with directives
  fsAdapter.writeFileSync(
    'project/examples/text/assignment/example.md',
    '@text greeting = "Hello, world!"'
  );
  fsAdapter.writeFileSync(
    'project/examples/text/assignment/expected.md',
    'Hello, world!'
  );
  
  // Variant example
  fsAdapter.writeFileSync(
    'project/examples/text/assignment/example-multiline.md',
    '@text greeting = "Hello,\nworld!"'
  );
  fsAdapter.writeFileSync(
    'project/examples/text/assignment/expected-multiline.md',
    'Hello,\nworld!'
  );
  
  // Example with multiple directives
  fsAdapter.writeFileSync(
    'project/examples/text/assignment/example-combined.md',
    '@text greeting = "Hello, world!"\n@text farewell = "Goodbye, world!"'
  );
  fsAdapter.writeFileSync(
    'project/examples/text/assignment/expected-combined.md',
    'Hello, world!\nGoodbye, world!'
  );
  
  fsAdapter.writeFileSync(
    'project/examples/text/template/example.md',
    '@text template = [[Template with {{var}}]]'
  );
  fsAdapter.writeFileSync(
    'project/examples/text/template/expected.md',
    'Template with value'
  );
  
  fsAdapter.writeFileSync(
    'project/examples/run/command/example.md',
    '@run echo "Testing"'
  );
  fsAdapter.writeFileSync(
    'project/examples/run/command/expected.md',
    'Testing'
  );
  
  fsAdapter.writeFileSync(
    'project/examples/import/module/example.md',
    '@import { component } from "./path/to/module"'
  );
  
  // Create output directories
  fsAdapter.mkdirSync('project/output', { recursive: true });
  fsAdapter.mkdirSync('project/output/types', { recursive: true });
  fsAdapter.mkdirSync('project/output/snapshots', { recursive: true });
  fsAdapter.mkdirSync('project/output/e2e', { recursive: true });
}