import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Explorer } from '../src/explorer';

describe('AST Explorer', () => {
  const testOutputDir = path.join(__dirname, 'test-output');
  let explorer: Explorer;
  
  beforeEach(() => {
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
  });
  
  it('should parse a text directive successfully', () => {
    const directive = '@text greeting = "Hello, world!"';
    const ast = explorer.parseDirective(directive);
    
    expect(ast).toBeDefined();
    expect(ast.type).toBe('Directive');
    expect(ast.kind).toBe('text');
    expect(ast.subtype).toBe('textAssignment');
    expect(ast.values).toHaveProperty('identifier');
    expect(ast.values).toHaveProperty('content');
    expect(ast.raw).toHaveProperty('identifier');
    expect(ast.raw).toHaveProperty('content');
  });
  
  it('should generate types from a directive', () => {
    const directive = '@text greeting = "Hello, world!"';
    const outputPath = explorer.generateTypes(directive, 'text-assignment');
    
    expect(fs.existsSync(outputPath)).toBe(true);
    const content = fs.readFileSync(outputPath, 'utf8');
    
    expect(content).toContain('export interface');
    expect(content).toContain('TextAssignmentDirectiveNode');
    expect(content).toContain("extends TypedDirectiveNode<'text', 'textAssignment'>");
    expect(content).toContain('values: {');
    expect(content).toContain('raw: {');
    expect(content).toContain('meta: {');
  });
  
  it('should generate a snapshot from a directive', () => {
    const directive = '@text greeting = "Hello, world!"';
    const snapshotPath = explorer.generateSnapshot(directive, 'text-assignment');
    
    expect(fs.existsSync(snapshotPath)).toBe(true);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    
    expect(snapshot).toHaveProperty('type', 'Directive');
    expect(snapshot).toHaveProperty('kind', 'text');
    expect(snapshot).toHaveProperty('subtype', 'textAssignment');
  });
});