import { MemfsTestFileSystem } from './MemfsTestFileSystem';
import { ProjectBuilder } from './ProjectBuilder';
import { TestSnapshot } from './TestSnapshot';
import { FixtureManager } from './FixtureManager';
import * as testFactories from './testFactories';
import { ParserService } from '../../services/ParserService/ParserService';
import { InterpreterService } from '../../services/InterpreterService/InterpreterService';
import { DirectiveService } from '../../services/DirectiveService/DirectiveService';
import { ValidationService } from '../../services/ValidationService/ValidationService';
import { StateService } from '../../services/StateService/StateService';
import { PathService } from '../../services/PathService/PathService';
import { CircularityService } from '../../services/CircularityService/CircularityService';
import { ResolutionService } from '../../services/ResolutionService/ResolutionService';
import { FileSystemService } from '../../services/FileSystemService/FileSystemService';
import type { IParserService } from '../../services/ParserService/IParserService';
import type { IInterpreterService } from '../../services/InterpreterService/IInterpreterService';
import type { IDirectiveService } from '../../services/DirectiveService/IDirectiveService';
import type { IValidationService } from '../../services/ValidationService/IValidationService';
import type { IStateService } from '../../services/StateService/IStateService';
import type { IPathService } from '../../services/PathService/IPathService';
import type { ICircularityService } from '../../services/CircularityService/ICircularityService';
import type { IResolutionService } from '../../services/ResolutionService/IResolutionService';
import type { IFileSystemService } from '../../services/FileSystemService/IFileSystemService';
import * as fs from 'fs-extra';
import * as path from 'path';
import { filesystemLogger as logger } from '../../core/utils/logger';

interface SnapshotDiff {
  added: string[];
  removed: string[];
  modified: string[];
  modifiedContents: Map<string, string>;
}

interface TestFixtures {
  load(fixtureName: string): Promise<void>;
}

interface TestSnapshotInterface {
  takeSnapshot(): Promise<Map<string, string>>;
  compare(before: Map<string, string>, after: Map<string, string>): SnapshotDiff;
}

interface TestServices {
  parser: IParserService;
  interpreter: IInterpreterService;
  directive: IDirectiveService;
  validation: IValidationService;
  state: IStateService;
  path: IPathService;
  circularity: ICircularityService;
  resolution: IResolutionService;
  filesystem: IFileSystemService;
}

/**
 * Main test context that provides access to all test utilities
 */
export class TestContext {
  public readonly fs: MemfsTestFileSystem;
  public builder: ProjectBuilder;
  public readonly fixtures: TestFixtures;
  public readonly snapshot: TestSnapshot;
  public factory: typeof testFactories;
  public readonly services: TestServices;
  private fixturesDir: string;

  constructor(fixturesDir: string = 'tests/fixtures') {
    this.fs = new MemfsTestFileSystem();
    this.fs.initialize();
    this.builder = new ProjectBuilder(this.fs);
    this.fixturesDir = fixturesDir;

    // Initialize fixtures
    this.fixtures = {
      load: async (fixtureName: string): Promise<void> => {
        const fixturePath = path.join(process.cwd(), this.fixturesDir, `${fixtureName}.json`);
        const fixtureContent = await fs.readFile(fixturePath, 'utf-8');
        const fixture = JSON.parse(fixtureContent);
        await this.fs.loadFixture(fixture);
      }
    };

    // Initialize snapshot
    this.snapshot = new TestSnapshot(this.fs);

    this.factory = testFactories;

    // Initialize all services
    const validation = new ValidationService();
    const state = new StateService();
    const filesystem = new FileSystemService(this.fs);
    const path = new PathService();
    path.initialize(filesystem);
    const parser = new ParserService();
    const circularity = new CircularityService();
    const interpreter = new InterpreterService();
    const resolution = new ResolutionService(state, filesystem, parser);

    // Initialize directive service
    const directive = new DirectiveService();
    directive.initialize(
      validation,
      state,
      path,
      filesystem,
      parser,
      interpreter,
      circularity,
      resolution
    );

    // Initialize interpreter service
    interpreter.initialize(directive, state);

    // Update directive service with interpreter reference
    directive.updateInterpreterService(interpreter);

    // Expose services
    this.services = {
      parser,
      interpreter,
      directive,
      validation,
      state,
      path,
      circularity,
      resolution,
      filesystem
    };
  }

  /**
   * Initialize the test context
   */
  async initialize(): Promise<void> {
    this.fs.initialize();
    // Ensure project directory exists
    await this.fs.mkdir('/project');
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.fs.cleanup();
  }

  /**
   * Write a file to the test filesystem
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    logger.debug('Writing file in test context', { relativePath });
    
    // Normalize the path to use forward slashes
    const normalizedPath = relativePath.replace(/\\/g, '/');
    
    // Ensure the path is absolute
    const absolutePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    
    // Get the directory path
    const dirPath = path.dirname(absolutePath);
    
    // Ensure parent directory exists
    if (dirPath !== '/') {
      logger.debug('Creating parent directory', { dirPath });
      await this.fs.mkdir(dirPath);
    }
    
    // Write the file
    logger.debug('Writing file', { absolutePath });
    await this.fs.writeFile(absolutePath, content);
  }

  /**
   * Parse meld content using meld-ast
   */
  parseMeld(content: string) {
    return this.services.parser.parse(content);
  }

  parseMeldWithLocations(content: string, filePath?: string) {
    return this.services.parser.parseWithLocations(content, filePath);
  }

  /**
   * Convert content to XML using llmxml
   */
  async convertToXml(content: string) {
    const { LLMXML } = await import('llmxml');
    const llmxml = new LLMXML();
    return llmxml.toXML(content);
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
  async takeSnapshot(dir?: string): Promise<Map<string, string>> {
    return this.snapshot.takeSnapshot(dir);
  }

  /**
   * Compare two filesystem snapshots
   */
  compareSnapshots(before: Map<string, string>, after: Map<string, string>): SnapshotDiff {
    return this.snapshot.compare(before, after);
  }
} 