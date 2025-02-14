import { parse as meldAstParse } from 'meld-ast';
import { convertToXml } from 'llmxml';
import { MemfsTestFileSystem } from './MemfsTestFileSystem';
import { ProjectBuilder } from './ProjectBuilder';
import { TestSnapshot } from './TestSnapshot';
import { FixtureManager } from './FixtureManager';
import * as testFactories from './testFactories';
import { ParserService } from '../../services/ParserService/ParserService';
import type { IParserService } from '../../services/ParserService/IParserService';

/**
 * Main test context that provides access to all test utilities
 */
export class TestContext {
  public fs: MemfsTestFileSystem;
  public builder: ProjectBuilder;
  public snapshot: TestSnapshot;
  public fixtures: FixtureManager;
  public factory: typeof testFactories;
  private parserService: IParserService;

  constructor(private fixturesDir: string = 'tests/fixtures') {
    this.fs = new MemfsTestFileSystem();
    this.builder = new ProjectBuilder(this.fs);
    this.snapshot = new TestSnapshot(this.fs);
    this.fixtures = new FixtureManager(this.builder, this.fixturesDir);
    this.factory = testFactories;
    this.parserService = new ParserService();
  }

  /**
   * Initialize the test context
   */
  async initialize(): Promise<void> {
    await this.fs.initialize();
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.fs.cleanup();
    this.fixtures.clearCache();
  }

  /**
   * Write a file to the test filesystem
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.fs.getPath(relativePath);
    this.fs.writeFile(fullPath, content);
  }

  /**
   * Parse meld content using meld-ast
   */
  parseMeld(content: string) {
    return this.parserService.parse(content);
  }

  parseMeldWithLocations(content: string, filePath?: string) {
    return this.parserService.parseWithLocations(content, filePath);
  }

  /**
   * Convert content to XML using llmxml
   */
  convertToXml(content: string) {
    return convertToXml(content);
  }

  /**
   * Create a basic test project structure
   */
  async createBasicProject(): Promise<void> {
    await this.builder.createBasicProject();
  }

  /**
   * Take a snapshot of the current filesystem state
   */
  takeSnapshot(dir?: string) {
    return this.snapshot.takeSnapshot(dir);
  }

  /**
   * Compare two filesystem snapshots
   */
  compareSnapshots(before: Map<string, string>, after: Map<string, string>) {
    return this.snapshot.compare(before, after);
  }
} 