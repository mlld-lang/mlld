import { MemfsTestFileSystem } from './MemfsTestFileSystem.js';
import { ProjectBuilder } from './ProjectBuilder.js';
import { TestSnapshot } from './TestSnapshot.js';
import { FixtureManager } from './FixtureManager.js';
import * as testFactories from './testFactories.js';
import { ParserService } from '@services/ParserService/ParserService.js';
import { InterpreterService } from '@services/InterpreterService/InterpreterService.js';
import { DirectiveService } from '@services/DirectiveService/DirectiveService.js';
import { ValidationService } from '@services/ValidationService/ValidationService.js';
import { StateService } from '@services/StateService/StateService.js';
import { PathService } from '@services/PathService/PathService.js';
import { CircularityService } from '@services/CircularityService/CircularityService.js';
import { ResolutionService } from '@services/ResolutionService/ResolutionService.js';
import { FileSystemService } from '@services/FileSystemService/FileSystemService.js';
import { OutputService } from '@services/OutputService/OutputService.js';
import { StateTrackingService } from '@services/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from '@services/StateVisualizationService/StateVisualizationService.js';
import { StateDebuggerService } from '@services/StateDebuggerService/StateDebuggerService.js';
import { StateHistoryService } from '@services/StateHistoryService/StateHistoryService.js';
import { StateEventService } from '@services/StateEventService/StateEventService.js';
import type { IParserService } from '@services/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import type { IDirectiveService } from '@services/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IPathService } from '@services/PathService/IPathService.js';
import type { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import type { IOutputService } from '@services/OutputService/IOutputService.js';
import type { IStateTrackingService } from '@services/StateTrackingService/IStateTrackingService.js';
import type { IStateVisualizationService } from '@services/StateVisualizationService/IStateVisualizationService.js';
import type { IStateDebuggerService } from '@services/StateDebuggerService/IStateDebuggerService.js';
import type { IStateHistoryService } from '@services/StateHistoryService/IStateHistoryService.js';
import type { IStateEventService } from '@services/StateEventService/IStateEventService.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import { filesystemLogger as logger } from '@core/utils/logger.js';
import { PathOperationsService } from '@services/FileSystemService/PathOperationsService.js';

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
  output: IOutputService;
  tracking: IStateTrackingService;
  visualization: IStateVisualizationService;
  debugger: IStateDebuggerService;
  history: IStateHistoryService;
  events: IStateEventService;
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

    // Initialize services
    const pathOps = new PathOperationsService();
    const filesystem = new FileSystemService(pathOps, this.fs);
    const validation = new ValidationService();
    const tracking = new StateTrackingService();
    const eventService = new StateEventService();
    const history = new StateHistoryService(eventService);
    const visualization = new StateVisualizationService();
    const state = new StateService();
    state.setCurrentFilePath('test.meld'); // Set initial file path
    state.enableTransformation(true); // Enable transformation by default for tests
    state.setTrackingService(tracking); // Enable state tracking
    state.setEventService(eventService); // Set event service for state operations
    const path = new PathService();
    path.initialize(filesystem);
    const parser = new ParserService();
    const circularity = new CircularityService();
    const interpreter = new InterpreterService();
    const resolution = new ResolutionService(state, filesystem, parser);
    const output = new OutputService();

    // Initialize debugger service
    const debuggerService = new StateDebuggerService(
      visualization,
      history,
      tracking
    );

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

    // Register default handlers after all services are initialized
    directive.registerDefaultHandlers();

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
      filesystem,
      output,
      tracking,
      visualization,
      debugger: debuggerService,
      history,
      events: eventService
    };
  }

  /**
   * Initialize the test context
   */
  async initialize(): Promise<void> {
    this.fs.initialize();
    // Ensure project directory exists
    await this.fs.mkdir('/project');
    // Ensure fixture directories exist
    await this.fs.mkdir('/project/src');
    await this.fs.mkdir('/project/nested');
    await this.fs.mkdir('/project/shared');
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
  public async toXML(content: any): Promise<string> {
    const { createLLMXML } = await import('llmxml');
    const llmxml = createLLMXML();
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

  /**
   * Start a debug session for test tracing
   */
  async startDebugSession(config?: Partial<DebugSessionConfig>): Promise<string> {
    const defaultConfig = {
      captureConfig: {
        capturePoints: ['pre-transform', 'post-transform', 'error'],
        includeFields: ['nodes', 'transformedNodes', 'variables'],
        format: 'full'
      },
      traceOperations: true,
      collectMetrics: true
    };

    return this.services.debugger.startSession({
      ...defaultConfig,
      ...config
    });
  }

  /**
   * End a debug session and get results
   */
  async endDebugSession(sessionId: string): Promise<DebugSessionResult> {
    return this.services.debugger.endSession(sessionId);
  }

  /**
   * Get a visualization of the current state
   */
  async visualizeState(format: 'mermaid' | 'dot' = 'mermaid'): Promise<string> {
    return this.services.visualization.exportStateGraph({
      format,
      includeMetadata: true,
      includeTimestamps: true
    });
  }
} 