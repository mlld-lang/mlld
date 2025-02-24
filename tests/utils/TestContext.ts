import { MemfsTestFileSystem } from './MemfsTestFileSystem.js';
import { ProjectBuilder } from './ProjectBuilder.js';
import { TestSnapshot } from './TestSnapshot.js';
import { FixtureManager } from './FixtureManager.js';
import * as testFactories from './testFactories.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { StateTrackingService } from './debug/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from './debug/StateVisualizationService/StateVisualizationService.js';
import { StateDebuggerService } from './debug/StateDebuggerService/StateDebuggerService.js';
import { StateHistoryService } from './debug/StateHistoryService/StateHistoryService.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import type { IStateTrackingService } from './debug/StateTrackingService/IStateTrackingService.js';
import type { IStateVisualizationService } from './debug/StateVisualizationService/IStateVisualizationService.js';
import type { IStateDebuggerService } from './debug/StateDebuggerService/IStateDebuggerService.js';
import type { IStateHistoryService } from './debug/StateHistoryService/IStateHistoryService.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import { filesystemLogger as logger } from '@core/utils/logger.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import type { DebugSessionConfig, DebugSessionResult } from './debug/StateDebuggerService/IStateDebuggerService.js';

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
    const visualization = new StateVisualizationService(history, tracking);
    const path = new PathService();
    path.initialize(filesystem);
    const parser = new ParserService();
    const circularity = new CircularityService();
    const interpreter = new InterpreterService();
    const output = new OutputService();

    // Initialize state service last, after all other services are ready
    const state = new StateService();
    state.setCurrentFilePath('test.meld'); // Set initial file path
    state.enableTransformation(true); // Enable transformation by default for tests
    state.setEventService(eventService); // Set event service for state operations
    state.setTrackingService(tracking); // Enable state tracking
    
    // Initialize resolution service after state is ready
    const resolution = new ResolutionService(state, filesystem, parser);

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
    const defaultConfig: DebugSessionConfig = {
      captureConfig: {
        capturePoints: ['pre-transform', 'post-transform', 'error'] as const,
        includeFields: ['nodes', 'transformedNodes', 'variables'] as const,
        format: 'full'
      },
      visualization: {
        format: 'mermaid',
        includeMetadata: true,
        includeTimestamps: true
      },
      traceOperations: true,
      collectMetrics: true
    };

    const mergedConfig = { ...defaultConfig, ...config };
    return await this.services.debugger.startSession(mergedConfig);
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