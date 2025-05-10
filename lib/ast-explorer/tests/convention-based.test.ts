/**
 * Tests for the convention-based directory structure processing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { Explorer, IFileSystemAdapter } from '../src/explorer';

// Mock filesystem for testing
class MockFileSystem implements IFileSystemAdapter {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  constructor() {
    // Add base directories expected by Explorer
    this.directories.add('./');
    this.directories.add('./examples');
    this.directories.add('./output');
    this.directories.add('./output/snapshots');
    this.directories.add('./output/types');
    this.directories.add('./fixtures');
    this.directories.add('./output/docs');
  }

  writeFileSync(filePath: string, content: string, encoding: string = 'utf8'): void {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    this.mkdirSync(dir, { recursive: true });

    this.files.set(filePath, content);
  }

  readFileSync(filePath: string, encoding: string = 'utf8'): string {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`File not found: ${filePath}`);
    }
    return content;
  }

  existsSync(pathToCheck: string): boolean {
    return this.files.has(pathToCheck) || this.directories.has(pathToCheck);
  }

  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
    if (options?.recursive) {
      // Create all parent directories
      const parts = dirPath.split(path.sep).filter(Boolean);
      let currentPath = '.';
      this.directories.add(currentPath);

      for (const part of parts) {
        currentPath = path.join(currentPath, part);
        this.directories.add(currentPath);
      }
    } else {
      this.directories.add(dirPath);
    }
  }

  readdirSync(dirPath: string): string[] {
    if (!this.directories.has(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const result: string[] = [];

    // Get files directly in this directory
    for (const filePath of this.files.keys()) {
      if (path.dirname(filePath) === dirPath) {
        result.push(path.basename(filePath));
      }
    }

    // Get subdirectories directly in this directory
    for (const dirToCheck of this.directories) {
      if (dirToCheck !== dirPath && path.dirname(dirToCheck) === dirPath) {
        result.push(path.basename(dirToCheck));
      }
    }

    return result;
  }

  rmSync(pathToRemove: string, options?: { recursive?: boolean, force?: boolean }): void {
    if (this.directories.has(pathToRemove)) {
      this.directories.delete(pathToRemove);

      if (options?.recursive) {
        // Remove all files and directories under this directory
        for (const filePath of [...this.files.keys()]) {
          if (filePath.startsWith(pathToRemove + path.sep)) {
            this.files.delete(filePath);
          }
        }

        for (const dirPath of [...this.directories]) {
          if (dirPath.startsWith(pathToRemove + path.sep)) {
            this.directories.delete(dirPath);
          }
        }
      }
    } else if (this.files.has(pathToRemove)) {
      this.files.delete(pathToRemove);
    } else if (!options?.force) {
      throw new Error(`Path not found: ${pathToRemove}`);
    }
  }
}

describe('Convention-Based Directory Structure Processing', () => {
  // Create a mock filesystem for testing
  let mockFs: MockFileSystem;

  // Spy on console.log
  let logSpy: any;

  beforeEach(() => {
    mockFs = new MockFileSystem();
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should process examples from the conventional directory structure', () => {
    // Create explorer instance with mock filesystem
    const explorer = new Explorer({
      examplesDir: './examples',
      outputDir: './output',
      fixturesDir: './fixtures',
      fileSystem: mockFs
    });

    // Process examples
    explorer.processExampleDirs();

    // Verify snapshots were created
    expect(mockFs.existsSync('./output/snapshots')).toBe(true);
    expect(mockFs.existsSync('./output/snapshots/text-assignment.snapshot.json')).toBe(true);
    expect(mockFs.existsSync('./output/snapshots/text-assignment-multiline.snapshot.json')).toBe(true);
    expect(mockFs.existsSync('./output/snapshots/text-template.snapshot.json')).toBe(true);
    expect(mockFs.existsSync('./output/snapshots/run-command.snapshot.json')).toBe(true);

    // Verify E2E fixtures were created
    expect(mockFs.existsSync('./fixtures/text-assignment.fixture.json')).toBe(true);
    expect(mockFs.existsSync('./fixtures/text-assignment-multiline.fixture.json')).toBe(true);
  });

  it('should generate consolidated types with discriminated unions', () => {
    // Create explorer instance with mock filesystem
    const explorer = new Explorer({
      examplesDir: './examples',
      outputDir: './output',
      snapshotsDir: './output/snapshots',
      typesDir: './output/types',
      fileSystem: mockFs
    });

    // Process examples first
    explorer.processExampleDirs();

    // Generate consolidated types
    explorer.generateConsolidatedTypes();

    // Verify types were created
    expect(mockFs.existsSync('./output/types')).toBe(true);
    expect(mockFs.existsSync('./output/types/text.ts')).toBe(true);
    expect(mockFs.existsSync('./output/types/run.ts')).toBe(true);
    expect(mockFs.existsSync('./output/types/index.ts')).toBe(true);
  });

  it('should run the complete workflow with processAll()', () => {
    // Create explorer instance with mock filesystem
    const explorer = new Explorer({
      examplesDir: './examples',
      outputDir: './output',
      fixturesDir: './fixtures',
      snapshotsDir: './output/snapshots',
      typesDir: './output/types',
      docsDir: './output/docs',
      fileSystem: mockFs
    });

    // Run the complete workflow
    explorer.processAll();

    // Verify all outputs were created
    expect(mockFs.existsSync('./output/snapshots')).toBe(true);
    expect(mockFs.existsSync('./output/types')).toBe(true);
    expect(mockFs.existsSync('./output/docs')).toBe(true);
    expect(mockFs.existsSync('./fixtures')).toBe(true);

    // Check console.log was called with success message
    expect(logSpy).toHaveBeenCalledWith('Process completed successfully!');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Output directory'));
  });
});