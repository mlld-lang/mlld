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
import {
  processBatch,
  loadExamples,
  processSnapshots,
  processExampleDirs,
  generateConsolidatedTypes,
  type Example
} from './batch';
import createConfig, { AstExplorerConfig } from './config';
import type { DirectiveNode } from '@grammar/types/base';

/**
 * Interface for filesystem adapter (used for testing)
 */
export interface IFileSystemAdapter {
  writeFileSync(path: string, content: string, encoding?: string): void;
  readFileSync(path: string, encoding?: string): string;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  rmSync(path: string, options?: { recursive?: boolean, force?: boolean }): void;
}

/**
 * Default filesystem adapter using Node's fs module
 */
class NodeFsAdapter implements IFileSystemAdapter {
  writeFileSync(path: string, content: string, encoding: string = 'utf8'): void {
    fs.writeFileSync(path, content, { encoding });
  }

  readFileSync(path: string, encoding: string = 'utf8'): string {
    return fs.readFileSync(path, { encoding }).toString();
  }

  existsSync(path: string): boolean {
    return fs.existsSync(path);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    fs.mkdirSync(path, options);
  }

  readdirSync(path: string): string[] {
    return fs.readdirSync(path);
  }

  rmSync(path: string, options?: { recursive?: boolean, force?: boolean }): void {
    fs.rmSync(path, options);
  }
}

export interface ExplorerOptions {
  configPath?: string;        // Path to config file
  outputDir?: string;         // Override config output dir
  snapshotsDir?: string;      // Override config snapshots dir
  typesDir?: string;          // Override config types dir
  fixturesDir?: string;       // Override config fixtures dir
  docsDir?: string;           // Override config docs dir
  examplesDir?: string;       // Override config examples dir
  fileSystem?: IFileSystemAdapter; // Custom filesystem adapter (for testing)
  useMockParser?: boolean;    // Use mock parser instead of real one
}

/**
 * Main Explorer class for AST exploration and generation
 */
export class Explorer {
  private options: Required<ExplorerOptions>;
  protected fs: IFileSystemAdapter;
  protected config: AstExplorerConfig;

  constructor(options: ExplorerOptions = {}) {
    // Set filesystem adapter
    this.fs = options.fileSystem || new NodeFsAdapter();

    // Load configuration
    this.config = createConfig(options.configPath);

    // Set mock parser if requested
    if (options.useMockParser || this.config.options.useMockParser) {
      process.env.MOCK_AST = 'true';
    }

    // Set default options, prioritizing constructor options over config
    this.options = {
      configPath: options.configPath || '',
      outputDir: options.outputDir || this.config.paths.outputDir,
      snapshotsDir: options.snapshotsDir || this.config.paths.snapshotsDir,
      typesDir: options.typesDir || this.config.paths.typesOutputDir,
      fixturesDir: options.fixturesDir || this.config.paths.fixturesDir,
      docsDir: options.docsDir || this.config.paths.docsOutputDir,
      examplesDir: options.examplesDir || this.config.paths.examplesDir,
      fileSystem: this.fs,
      useMockParser: options.useMockParser || this.config.options.useMockParser
    };

    // Create output directories
    [
      this.options.outputDir,
      this.options.snapshotsDir,
      this.options.typesDir,
      this.options.fixturesDir,
      this.options.docsDir
    ].forEach(dir => {
      if (!this.fs.existsSync(dir)) {
        this.fs.mkdirSync(dir, { recursive: true });
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

    // Ensure directory exists
    if (!this.fs.existsSync(targetDir)) {
      this.fs.mkdirSync(targetDir, { recursive: true });
    }

    // Write the type definition
    this.fs.writeFileSync(outputPath, typeDefinition);

    return outputPath;
  }
  
  /**
   * Generate a test fixture from a directive
   */
  generateFixture(directive: string, name: string, outputDir?: string): string {
    const ast = this.parseDirective(directive);
    const fixture = generateTestFixture(directive, ast, name);

    const targetDir = outputDir || this.options.fixturesDir;
    return writeTestFixture(fixture, name, targetDir, this.fs);
  }
  
  /**
   * Generate a snapshot from a directive
   */
  generateSnapshot(directive: string, name: string, outputDir?: string): string {
    const ast = this.parseDirective(directive);
    return generateSnapshot(
      ast,
      name,
      outputDir || this.options.snapshotsDir,
      this.fs
    );
  }

  /**
   * Compare a directive with an existing snapshot
   */
  compareWithSnapshot(directive: string, name: string): boolean {
    const ast = this.parseDirective(directive);
    return compareWithSnapshot(
      ast,
      name,
      this.options.snapshotsDir,
      this.fs
    );
  }
  
  /**
   * Process a batch of examples
   */
  processBatch(examplesPath: string): void {
    const examples = loadExamples(examplesPath, this.fs);
    processBatch(examples, this.options.outputDir, this.fs);
  }

  /**
   * Process examples directly
   */
  processExamples(examples: Example[]): void {
    processBatch(examples, this.options.outputDir, this.fs);
  }

  /**
   * Process examples from directory structure
   */
  processExampleDirs(baseDir?: string): void {
    const targetDir = baseDir || this.options.examplesDir;
    processExampleDirs(targetDir, this.options.outputDir, this.fs);
  }

  /**
   * Generate consolidated type system with discriminated unions
   */
  generateConsolidatedTypes(outputDir?: string): void {
    const targetDir = outputDir || this.options.typesDir;
    generateConsolidatedTypes(this.options.snapshotsDir, targetDir, this.fs);
  }

  /**
   * Process existing snapshots to generate docs and types
   */
  processSnapshots(): void {
    processSnapshots(this.options.snapshotsDir, this.options.outputDir, this.fs);
  }
  
  /**
   * Generate documentation from snapshots
   */
  generateDocs(): void {
    // Get all snapshot names using the filesystem adapter
    const snapshotFiles = this.fs.readdirSync(this.options.snapshotsDir)
      .filter(file => file.endsWith('.snapshot.json'))
      .map(file => file.replace('.snapshot.json', ''));

    generateDocumentation(snapshotFiles, this.options.snapshotsDir, this.options.docsDir, this.fs);
  }
}