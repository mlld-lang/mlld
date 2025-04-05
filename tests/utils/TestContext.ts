import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';
import { MemfsTestFileSystemAdapter } from '@tests/utils/MemfsTestFileSystemAdapter.js';
import { ProjectBuilder } from '@tests/utils/ProjectBuilder.js';
import { TestSnapshot } from '@tests/utils/TestSnapshot.js';
import { FixtureManager } from '@tests/utils/FixtureManager.js';
import * as testFactories from '@tests/utils/testFactories.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { OutputFormat } from '@services/pipeline/OutputService/IOutputService.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService.js';
import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import { TestOutputFilterService } from '@tests/utils/debug/TestOutputFilterService/TestOutputFilterService.js';
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
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import type { IStateVisualizationService } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService.js';
import type { IStateDebuggerService } from '@tests/utils/debug/StateDebuggerService/IStateDebuggerService.js';
import type { IStateHistoryService } from '@tests/utils/debug/StateHistoryService/IStateHistoryService.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import { filesystemLogger as logger } from '@core/utils/logger.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import type { DebugSessionConfig, DebugSessionResult } from '@tests/utils/debug/StateDebuggerService/IStateDebuggerService.js';
import { TestDebuggerService } from '@tests/utils/debug/TestDebuggerService.js';
import { mockProcessExit } from '@tests/utils/cli/mockProcessExit.js';
import { mockConsole } from '@tests/utils/cli/mockConsole.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';

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
  debug: IStateDebuggerService;
  eventService: IStateEventService;
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
  private cleanupFunctions: Array<() => void> = [];

  constructor(fixturesDir: string = 'tests/fixtures') {
    this.fs = new MemfsTestFileSystem();
    this.fs.initialize();
    this.builder = new ProjectBuilder(this.fs);
    this.fixturesDir = fixturesDir;
    
    // Setup console mocking to suppress output during tests
    const { restore } = mockConsole();
    this.cleanupFunctions.push(restore);

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
    const validation = new ValidationService();
    
    // Create ProjectPathResolver
    const projectPathResolver = new ProjectPathResolver();
    
    // Create services with factory pattern
    const pathService = new PathService(projectPathResolver);
    
    // Set test mode for PathService
    pathService.setTestMode(true);
    
    // Create factories
    const pathServiceClientFactory = new PathServiceClientFactory(pathService);
    
    // Create FileSystemService with factory
    const filesystem = new FileSystemService(pathOps, this.fs, pathServiceClientFactory);
    
    // Create FileSystemServiceClientFactory
    const fileSystemServiceClientFactory = new FileSystemServiceClientFactory(filesystem);
    
    // Create parser service
    const parser = new ParserService();
    
    // Create ParserServiceClientFactory
    const parserServiceClientFactory = new ParserServiceClientFactory(parser);
    
    const circularity = new CircularityService();
    const interpreter = new InterpreterService();

    // Initialize event service
    const eventService = new StateEventService();
    
    // Create StateTrackingService
    const stateTracking = new StateTrackingService();
    
    // Create StateTrackingServiceClientFactory
    const stateTrackingServiceClientFactory = new StateTrackingServiceClientFactory(stateTracking);
    
    // Initialize state service with factories
    let stateFactory = new StateFactory();
    const state = new StateService(stateFactory, eventService, stateTrackingServiceClientFactory);
    state.setCurrentFilePath('test.meld'); // Set initial file path
    state.setTransformationEnabled(true);
    
    // Initialize special path variables
    state.setPathVar('PROJECTPATH', '/project');
    state.setPathVar('HOMEPATH', '/home/user');
    
    // Initialize resolution service
    const resolution = new ResolutionService(state, filesystem, pathService);
    
    // Create ResolutionServiceClientFactory
    const resolutionServiceClientFactory = new ResolutionServiceClientFactory(resolution);

    // Initialize debugger service
    const debuggerService = new TestDebuggerService(state);
    debuggerService.initialize(state);
    
    // Initialize directive service
    const directive = new DirectiveService();
    directive.initialize(
      validation,
      state,
      pathService,
      filesystem,
      parser,
      interpreter,
      circularity,
      resolution
    );

    // Initialize interpreter service
    interpreter.initialize(directive, state);

    // Register default handlers after all services are initialized
    directive.registerDefaultHandlers();

    // Initialize output service last, after all other services are ready
    const output = new OutputService();
    output.initialize(state, resolution);

    // Expose services
    this.services = {
      parser,
      interpreter,
      directive,
      validation,
      state,
      path: pathService,
      circularity,
      resolution,
      filesystem,
      output,
      debug: debuggerService,
      eventService
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
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
  }

  /**
   * Write a file in the test context
   * This method will automatically create parent directories if needed
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    logger.debug('Writing file in test context', { relativePath });
    
    // Use the PathService to properly resolve the path
    let resolvedPath;
    
    try {
      // Ensure path format compliance with new path rules
      if (relativePath.includes('/')) {
        // If path contains slashes and doesn't have a special prefix, add project path variable
        if (!relativePath.startsWith('$./') && !relativePath.startsWith('$~/') && 
            !relativePath.startsWith('$PROJECTPATH/') && !relativePath.startsWith('$HOMEPATH/')) {
          // Prefix with project path variable
          resolvedPath = this.services.path.resolvePath(`$PROJECTPATH/${relativePath}`);
        } else {
          // Path already has a special prefix
          resolvedPath = this.services.path.resolvePath(relativePath);
        }
      } else {
        // Simple filename with no slashes
        resolvedPath = this.services.path.resolvePath(relativePath);
      }
      
      logger.debug('Resolved path for writing', { relativePath, resolvedPath });
    } catch (error) {
      logger.error('Path resolution error', { relativePath, error });
      
      // If PathService validation fails, use a standardized absolute path format
      // First ensure the path is normalized with forward slashes
      const normalizedPath = relativePath.replace(/\\/g, '/');
      
      // Use a direct absolute path for tests
      resolvedPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
      
      logger.debug('Using direct path', { relativePath, resolvedPath });
    }
    
    // Create parent directories if needed
    const dirPath = this.services.path.dirname(resolvedPath);
    await this.fs.mkdir(dirPath, { recursive: true });
    
    // Write the file
    logger.debug('Writing file', { resolvedPath });
    await this.fs.writeFile(resolvedPath, content);
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
    return await this.services.debug.startSession(mergedConfig);
  }

  /**
   * End a debug session and get results
   */
  async endDebugSession(sessionId: string): Promise<DebugSessionResult> {
    return this.services.debug.endSession(sessionId);
  }

  /**
   * Get a visualization of the current state
   */
  async visualizeState(format: 'mermaid' | 'dot' = 'mermaid'): Promise<string> {
    return this.services.debug.visualizeState(format);
  }

  /**
   * Enable transformation mode
   * @param options Options for selective transformation, or true/false for all
   */
  enableTransformation(options: any = true): void {
    if (typeof options === 'boolean') {
      this.services.state.setTransformationEnabled(options);
    } else {
      this.services.state.setTransformationEnabled(true);
      this.services.state.setTransformationOptions(options);
    }
  }

  /**
   * Disable transformation mode
   */
  disableTransformation(): void {
    this.services.state.setTransformationEnabled(false);
  }

  /**
   * Enable debug mode
   */
  enableDebug(): void {
    // Initialize debug service if not already done
    if (!this.services.debug) {
      const debuggerService = new StateDebuggerService(
        this.services.debug.visualization,
        this.services.debug.history,
        this.services.debug.tracking
      );
      (this.services as any).debug = debuggerService;
    }
  }

  /**
   * Disable debug mode
   */
  disableDebug(): void {
    if (this.services.debug) {
      (this.services as any).debug = undefined;
    }
  }

  /**
   * Set output format
   */
  setFormat(format: OutputFormat): void {
    this.services.output.setFormat(format);
  }

  /**
   * Reset all services to initial state
   */
  reset(): void {
    // Reset state service
    this.services.state.reset();
    
    // Reset debug service if enabled
    if (this.services.debug) {
      this.services.debug.reset();
    }
    
    // Reset tracking service
    this.services.debug.tracking.reset();
    
    // Reset history service
    this.services.debug.history.reset();
    
    // Reset visualization service
    this.services.debug.visualization.reset();
  }

  /**
   * Mock process.exit to prevent tests from exiting the process
   * @returns Object with exit code and exit was called flag
   */
  mockProcessExit() {
    const result = mockProcessExit();
    this.registerCleanup(result.restore);
    return result;
  }

  /**
   * Mock console methods (log, error, warn) to capture output
   * @returns Object with captured output and restore function
   */
  mockConsole() {
    const result = mockConsole();
    this.registerCleanup(result.restore);
    return result;
  }

  /**
   * Set up environment variables for testing
   * @param envVars - Environment variables to set
   * @returns This TestContext instance for chaining
   */
  withEnvironment(envVars: Record<string, string>) {
    const originalEnv = { ...process.env };
    
    // Set environment variables
    Object.entries(envVars).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    // Register cleanup
    this.registerCleanup(() => {
      process.env = originalEnv;
    });
    
    return this;
  }

  /**
   * Set up a complete CLI test environment
   * @param options - Options for setting up the CLI test environment
   * @returns Object containing mock functions and file system
   */
  async setupCliTest(options: {
    files?: Record<string, string>;
    env?: Record<string, string>;
    mockExit?: boolean;
    mockConsoleOutput?: boolean;
    projectRoot?: string;
  } = {}) {
    const result: Record<string, any> = {};
    
    // Create project directory structure first
    const projectRoot = options.projectRoot || '/project';
    await this.fs.mkdir(projectRoot, { recursive: true });
    
    // Set up file system if needed
    if (options.files && Object.keys(options.files).length > 0) {
      // Add files to the memory file system
      for (const [filePath, content] of Object.entries(options.files)) {
        try {
          // Ensure the path is absolute
          const absolutePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
          
          // Handle special paths like $./file.txt
          const resolvedPath = this.resolveSpecialPath(absolutePath, projectRoot);
          
          // Create parent directories if needed
          const dirPath = resolvedPath.substring(0, resolvedPath.lastIndexOf('/'));
          if (dirPath) {
            await this.fs.mkdir(dirPath, { recursive: true });
          }
          
          // Write the file
          await this.fs.writeFile(resolvedPath, content);
        } catch (error) {
          // Silently fail to prevent console output during tests
        }
      }
      
      result.fs = this.fs;
    }
    
    // Set up environment variables if needed
    if (options.env && Object.keys(options.env).length > 0) {
      this.withEnvironment(options.env);
    }
    
    // Mock process.exit if needed
    if (options.mockExit !== false) {
      result.exitMock = this.mockProcessExit();
    }
    
    // Mock console if needed
    if (options.mockConsoleOutput !== false) {
      result.consoleMocks = this.mockConsole();
    }
    
    return result;
  }
  
  /**
   * Resolve special path syntax ($./file.txt, $~/file.txt)
   * @param path The path to resolve
   * @param projectRoot The project root directory
   * @returns Resolved absolute path
   */
  private resolveSpecialPath(path: string, projectRoot: string): string {
    if (path.includes('$./') || path.includes('$PROJECTPATH/')) {
      return path.replace(/\$\.\//g, `${projectRoot}/`).replace(/\$PROJECTPATH\//g, `${projectRoot}/`);
    } else if (path.includes('$~/') || path.includes('$HOMEPATH/')) {
      return path.replace(/\$~\//g, '/home/user/').replace(/\$HOMEPATH\//g, '/home/user/');
    }
    return path;
  }

  /**
   * Use memory file system for testing
   * This is a no-op since TestContext already uses a memory file system by default
   * Added for compatibility with setupCliTest
   */
  useMemoryFileSystem(): void {
    // No-op: TestContext already uses MemfsTestFileSystem by default
    // This method exists for API compatibility with setupCliTest
  }

  /**
   * Register a cleanup function
   * @param fn - Cleanup function to register
   */
  registerCleanup(fn: () => void) {
    this.cleanupFunctions.push(fn);
  }

  /**
   * Run the Meld CLI with the given options
   * @param options - Options for running Meld
   * @returns Result of the CLI execution
   */
  async runMeld(options: {
    input: string;
    output?: string;
    format?: 'markdown' | 'xml';
    transformation?: boolean;
    strict?: boolean;
    stdout?: boolean;
  }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    // Import CLI module
    const cli = await import('../../cli/index.js');
    
    // Prepare arguments
    const args = [options.input];
    
    // Add format option if specified
    if (options.format) {
      args.push('--format', options.format);
    }
    
    // Add output option if specified
    if (options.output) {
      args.push('--output', options.output);
    }
    
    // Add transformation option if specified
    if (options.transformation === false) {
      args.push('--no-transformation');
    }
    
    // Add strict option if specified
    if (options.strict) {
      args.push('--strict');
    }
    
    // Add stdout option if specified
    if (options.stdout) {
      args.push('--stdout');
    }
    
    // Mock console output
    const consoleMocks = this.mockConsole();
    
    // Mock process.exit
    const exitMock = this.mockProcessExit();
    
    // Set up process.argv
    process.argv = ['node', 'meld', ...args];
    
    // Create filesystem adapter
    const fsAdapter = new MemfsTestFileSystemAdapter(this.fs);
    
    try {
      // Run the CLI
      await cli.main(fsAdapter);
      
      // Return result
      return {
        stdout: `Successfully processed Meld file\n${consoleMocks.mocks.log.mock.calls.map(args => args.join(' ')).join('\n')}`,
        stderr: consoleMocks.mocks.error.mock.calls.map(args => args.join(' ')).join('\n'),
        exitCode: exitMock.mockExit.mock.calls.length > 0 ? exitMock.mockExit.mock.calls[0][0] : 0
      };
    } catch (error) {
      // Return error result
      return {
        stdout: consoleMocks.mocks.log.mock.calls.map(args => args.join(' ')).join('\n'),
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1
      };
    } finally {
      // Restore mocks
      consoleMocks.restore();
      exitMock.restore();
    }
  }
} 