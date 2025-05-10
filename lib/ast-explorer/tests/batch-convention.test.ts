/**
 * Tests for the convention-based directory structure processing functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { MockFileSystem } from './test-utils';
import { processExampleDirs, generateConsolidatedTypes } from '../src/batch';
import { extractDirectives } from '../src/extract-directives';

// Make sure directory exists
vi.mock('../src/extract-directives', () => ({
  extractDirectives: vi.fn(() => ['@text greeting = "Hello, world!"'])
}));

// Mock parseDirective from ./parse
vi.mock('../src/parse', () => ({
  parseDirective: vi.fn(() => ({ kind: 'text', type: 'assignment' }))
}));

// Mock the snapshot generation to make tests work
vi.mock('../src/generate/snapshots', () => ({
  generateSnapshot: vi.fn((ast, name, outputDir, fs) => {
    // Mock implementation - create a basic snapshot file for testing
    const snapshotPath = path.join(outputDir, `${name}.snapshot.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(ast));
    return snapshotPath;
  })
}));

// Mock the type generation
vi.mock('../src/generate/types', () => ({
  generateTypeInterface: vi.fn(() => 'export type TestType = { kind: string; };')
}));

// Mock test fixture generation
vi.mock('../src/generate/fixtures', () => ({
  generateTestFixture: vi.fn(() => ({ name: 'test-fixture' })),
  writeTestFixture: vi.fn((fixture, name, outputDir, fs) => {
    // Mock implementation - create a basic fixture file for testing
    const fixturePath = path.join(outputDir, `${name}.fixture.json`);
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
    return fixturePath;
  })
}));

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
    vi.resetAllMocks();
  });

  it('should process examples from the conventional directory structure', () => {
    // Process examples using the processExampleDirs function
    processExampleDirs('./examples', './output', mockFs);

    // Output directories should be created
    expect(mockFs.existsSync('./output')).toBe(true);

    // Debug output for investigation
    mockFs.debug();
  });

  it('should handle missing directories gracefully', () => {
    // Process examples from a non-existent directory
    processExampleDirs('./non-existent', './output', mockFs);

    // Should not throw an error
    expect(mockFs.existsSync('./output')).toBe(true);
  });

  it('should support consolidated type generation', () => {
    // Setup mock snapshots directory
    mockFs.mkdirSync('./output/snapshots', { recursive: true });
    mockFs.writeFileSync('./output/snapshots/text-assignment.snapshot.json',
      JSON.stringify({ kind: 'text', type: 'assignment' }));
    mockFs.writeFileSync('./output/snapshots/text-template.snapshot.json',
      JSON.stringify({ kind: 'text', type: 'template' }));

    // Run consolidated type generation
    generateConsolidatedTypes('./output/snapshots', './output/types', mockFs);

    // Output directory should exist
    expect(mockFs.existsSync('./output/types')).toBe(true);
  });
});