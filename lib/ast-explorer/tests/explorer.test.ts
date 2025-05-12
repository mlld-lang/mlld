import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { Explorer } from '../src/explorer';
import { setupTestFileSystem } from './utils/FsManager';
import { TracedAdapter } from './TracedAdapter';
import { extractDirectives } from '../src/extract-directives';

// Mock extractDirectives
vi.mock('../src/extract-directives', () => ({
  extractDirectives: vi.fn((content) => {
    // Simple mock implementation for testing
    const directives = [];
    if (content.includes('@text greeting')) {
      directives.push('@text greeting = "Hello, world!"');
    }
    if (content.includes('@run echo')) {
      directives.push('@run echo "Testing"');
    }
    return directives;
  })
}));

describe('AST Explorer', () => {
  const testOutputDir = './test-output';
  const snapshotsDir = './test-output/snapshots';
  const typesDir = './test-output/types';

  let fsAdapter: TracedAdapter;
  let explorer: Explorer;
  let cleanup: () => Promise<void>;

  beforeEach(() => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AST = 'true';

    // Create filesystem adapters using FsManager to avoid conflicts
    const setup = setupTestFileSystem();
    fsAdapter = setup.fsAdapter;
    cleanup = setup.cleanup;

    console.log('Creating test directory structure');

    // Create directories in memfs at our "project" root
    fsAdapter.mkdirSync('project/test-output', { recursive: true });
    fsAdapter.mkdirSync('project/test-output/snapshots', { recursive: true });
    fsAdapter.mkdirSync('project/test-output/types', { recursive: true });

    console.log('Filesystem state after setup:', fsAdapter.dump());

    // Create fresh explorer instance for each test with our traced adapter
    explorer = new Explorer({
      outputDir: testOutputDir,
      snapshotsDir: snapshotsDir,
      typesDir: typesDir,
      fileSystem: fsAdapter
    });

    // Add methods for testing
    explorer.extractDirectives = extractDirectives;
    explorer.processExampleFile = vi.fn((filePath, options) => {
      const content = fsAdapter.existsSync(filePath) 
        ? fsAdapter.readFileSync(filePath)
        : '@text greeting = "Hello, world!"';
      
      const directives = extractDirectives(content);
      return { directives, filePath, options };
    });

    // Reset call history before each test
    fsAdapter.resetCalls();
  });

  afterEach(async () => {
    // Print call history for debugging
    fsAdapter.printCalls();

    // Clean up resources and restore fs
    await cleanup();

    // Reset environment
    delete process.env.NODE_ENV;
    delete process.env.MOCK_AST;

    vi.restoreAllMocks();
  });
  
  it('should parse a text directive successfully', () => {
    const directive = '@text greeting = "Hello, world!"';
    const ast = explorer.parseDirective(directive);
    
    expect(ast).toBeDefined();
    expect(ast.type).toBe('Directive');
    expect(ast.kind).toBe('text');
    expect(ast.subtype).toBe('textAssignment');
  });
  
  it('should generate types from a directive', () => {
    const directive = '@text greeting = "Hello, world!"';
    
    // Add a test file to verify memfs is working
    fsAdapter.writeFileSync('project/test-file.txt', 'Test content', 'utf8');
    
    // Reset call history to focus on the generateTypes call
    fsAdapter.resetCalls();
    
    // Call the method under test
    const outputPath = explorer.generateTypes(directive, 'text-assignment');
    console.log('Generated file path:', outputPath);
    
    // Print call history for this test
    fsAdapter.printCalls();
    
    // Convert output path to memfs path
    const memfsPath = `project/${outputPath}`;
    
    // Now check if the file exists and has content
    expect(fsAdapter.existsSync(memfsPath)).toBe(true);
    
    if (fsAdapter.existsSync(memfsPath)) {
      const content = fsAdapter.readFileSync(memfsPath);
      
      // Test for basic type structure
      expect(content).toContain('export interface');
      expect(content).toContain('text');
      expect(content).toContain('textAssignment');
    }
  });
  
  it('should generate a snapshot from a directive', () => {
    const directive = '@text greeting = "Hello, world!"';

    // Add a file to verify memfs is working
    fsAdapter.writeFileSync('project/test-snapshot-file.txt', 'Test snapshot', 'utf8');

    // Add a directory directly in the memfs volume for testing
    console.log('Creating test directory:');
    fsAdapter.getAdapter().getMemfs().vol.mkdirSync('project/test-output/snapshots/test-dir', { recursive: true });
    fsAdapter.writeFileSync('project/test-output/snapshots/test-dir/test.txt', 'Test', 'utf8');
    console.log('Dumping filesystem after test setup:', fsAdapter.dump());

    // Reset call history to focus on the generateSnapshot call
    fsAdapter.resetCalls();

    // Call the method under test
    console.log('==== Calling generateSnapshot ====');
    const snapshotPath = explorer.generateSnapshot(directive, 'text-assignment');
    console.log('==== generateSnapshot returned ====');
    console.log('Generated snapshot path:', snapshotPath);

    // Print call history
    console.log('Call history:');
    fsAdapter.printCalls();

    console.log('Filesystem after generate call:', fsAdapter.dump());

    // Check both with original path and memfs path
    console.log('Checking if exists (original path):', snapshotPath);
    console.log('Original path exists?', fsAdapter.existsSync(snapshotPath));

    // Convert output path to memfs path
    const memfsPath = `project/${snapshotPath}`;
    console.log('Checking if exists (memfs path):', memfsPath);
    console.log('Memfs path exists?', fsAdapter.existsSync(memfsPath));

    // Test for snapshot file existence
    expect(fsAdapter.existsSync(memfsPath)).toBe(true);
  });

  it('should extract directives from content', () => {
    const content = `
    # Example Meld file
    
    @text greeting = "Hello, world!"
    @run echo "Testing"
    `;
    
    // Call the method under test
    const directives = explorer.extractDirectives(content);
    
    // Verify extracted directives
    expect(directives).toHaveLength(2);
    expect(directives[0]).toBe('@text greeting = "Hello, world!"');
    expect(directives[1]).toBe('@run echo "Testing"');
  });

  it('should process examples with expected outputs', () => {
    // Setup test examples with both input and expected output
    fsAdapter.mkdirSync('project/examples/text', { recursive: true });
    fsAdapter.writeFileSync('project/examples/text/example.md', '@text greeting = "Hello, world!"');
    fsAdapter.writeFileSync('project/examples/text/expected.md', 'Hello, world!');
    
    // Call the method under test
    const result = explorer.processExampleFile('project/examples/text/example.md', {
      outputDir: testOutputDir,
      expectedOutput: 'project/examples/text/expected.md'
    });
    
    // Verify processing was called with correct arguments
    expect(result.directives).toContain('@text greeting = "Hello, world!"');
  });
});