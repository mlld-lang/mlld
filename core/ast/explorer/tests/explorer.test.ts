import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Explorer } from '../src/explorer';

describe('AST Explorer', () => {
  const testOutputDir = path.join(__dirname, 'test-output');
  let explorer: Explorer;
  
  beforeEach(() => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AST = 'true';
    
    // Create fresh explorer instance for each test
    explorer = new Explorer({
      outputDir: testOutputDir
    });
    
    // Ensure output directory exists
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });
  
  afterEach(() => {
    // Clean up test output
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
    
    // Reset environment
    delete process.env.NODE_ENV;
    delete process.env.MOCK_AST;
  });
  
  it('should parse a text directive successfully', () => {
    const directive = '@text greeting = "Hello, world!"';
    const ast = explorer.parseDirective(directive);
    
    // Debug output
    console.log('AST Object:', JSON.stringify(ast, null, 2));
    
    expect(ast).toBeDefined();
    expect(ast.type).toBe('Directive');
    expect(ast.kind).toBe('text');
    expect(ast.subtype).toBe('textAssignment');
    
    // Simplified test
    expect(typeof ast).toBe('object');
  });
  
  it('should generate types from a directive', () => {
    const directive = '@text greeting = "Hello, world!"';
    const outputPath = explorer.generateTypes(directive, 'text-assignment');
    
    expect(fs.existsSync(outputPath)).toBe(true);
    const content = fs.readFileSync(outputPath, 'utf8');
    
    // Test for basic type structure
    expect(content).toContain('export interface');
    expect(content).toContain('text');
    expect(content).toContain('textAssignment');
    expect(content).toContain('values:');
    expect(content).toContain('raw:');
    expect(content).toContain('meta:');
  });
  
  it('should generate a snapshot from a directive', () => {
    const directive = '@text greeting = "Hello, world!"';
    const snapshotPath = explorer.generateSnapshot(directive, 'text-assignment');
    
    // In test mode, file isn't actually created but path should be returned
    expect(snapshotPath).toBeDefined();
    expect(snapshotPath).toContain('text-assignment.snapshot.json');
  });
});