/**
 * Main Explorer class for AST exploration and generation
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseDirective, parseFile } from './parse';
import { generateTypeInterface } from './generate/types';
import { generateTestFixture, writeTestFixture } from './generate/fixtures';
import { generateSnapshot, compareWithSnapshot } from './generate/snapshots';
import { generateDocumentation } from './generate/docs';
import { processBatch, loadExamples, processSnapshots, processExampleDirs, generateConsolidatedTypes } from './batch';
import type { Example } from './batch';
import type { DirectiveNode } from '@grammar/types/base';

export interface ExplorerOptions {
  outputDir?: string;
  snapshotsDir?: string;
  typesDir?: string;
  fixturesDir?: string;
  docsDir?: string;
  examplesDir?: string;
}

/**
 * Main Explorer class for AST exploration and generation
 */
export class Explorer {
  private options: Required<ExplorerOptions>;
  
  constructor(options: ExplorerOptions = {}) {
    // Set default options
    this.options = {
      outputDir: options.outputDir || './generated',
      snapshotsDir: options.snapshotsDir || './generated/snapshots',
      typesDir: options.typesDir || './generated/types',
      fixturesDir: options.fixturesDir || './generated/fixtures',
      docsDir: options.docsDir || './generated/docs',
      examplesDir: options.examplesDir || './examples'
    };
    
    // Create output directories
    Object.values(this.options).forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * Parse a directive and get its AST
   */
  parseDirective(directive: string): DirectiveNode {
    return parseDirective(directive);
  }
  
  /**
   * Parse a file containing directives
   */
  parseFile(filePath: string): DirectiveNode[] {
    return parseFile(filePath);
  }
  
  /**
   * Generate TypeScript interface from a directive
   */
  generateTypes(directive: string, name: string, outputDir?: string): string {
    const ast = this.parseDirective(directive);
    const typeDefinition = generateTypeInterface(ast);
    
    const targetDir = outputDir || this.options.typesDir;
    const outputPath = path.join(targetDir, `${name}.ts`);
    fs.writeFileSync(outputPath, typeDefinition);
    
    return outputPath;
  }
  
  /**
   * Generate a test fixture from a directive
   */
  generateFixture(directive: string, name: string, outputDir?: string): string {
    const ast = this.parseDirective(directive);
    const fixture = generateTestFixture(directive, ast, name);
    
    const targetDir = outputDir || this.options.fixturesDir;
    return writeTestFixture(fixture, name, targetDir);
  }
  
  /**
   * Generate a snapshot from a directive
   */
  generateSnapshot(directive: string, name: string, outputDir?: string): string {
    const ast = this.parseDirective(directive);
    return generateSnapshot(ast, name, outputDir || this.options.snapshotsDir);
  }
  
  /**
   * Compare a directive with an existing snapshot
   */
  compareWithSnapshot(directive: string, name: string): boolean {
    const ast = this.parseDirective(directive);
    return compareWithSnapshot(ast, name, this.options.snapshotsDir);
  }
  
  /**
   * Process a batch of examples
   */
  processBatch(examplesPath: string): void {
    const examples = loadExamples(examplesPath);
    processBatch(examples, this.options.outputDir);
  }
  
  /**
   * Process examples directly
   */
  processExamples(examples: Example[]): void {
    processBatch(examples, this.options.outputDir);
  }
  
  /**
   * Process examples from directory structure
   */
  processExampleDirs(baseDir?: string): void {
    const targetDir = baseDir || this.options.examplesDir;
    processExampleDirs(targetDir, this.options.outputDir);
  }
  
  /**
   * Generate consolidated type system with discriminated unions
   */
  generateConsolidatedTypes(outputDir?: string): void {
    const targetDir = outputDir || this.options.typesDir;
    generateConsolidatedTypes(this.options.snapshotsDir, targetDir);
  }
  
  /**
   * Process existing snapshots to generate docs and types
   */
  processSnapshots(): void {
    processSnapshots(this.options.snapshotsDir, this.options.outputDir);
  }
  
  /**
   * Generate documentation from snapshots
   */
  generateDocs(): void {
    // Get all snapshot names
    const snapshotFiles = fs.readdirSync(this.options.snapshotsDir)
      .filter(file => file.endsWith('.snapshot.json'))
      .map(file => file.replace('.snapshot.json', ''));
    
    generateDocumentation(snapshotFiles, this.options.snapshotsDir, this.options.docsDir);
  }
}