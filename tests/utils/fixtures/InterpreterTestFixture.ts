import { vi } from 'vitest';
import { TestContextDI } from '../di/TestContextDI';
import { MockFactory } from '../mocks/MockFactory';
import { ClientFactoryHelpers } from '../mocks/ClientFactoryHelpers';
import { IInterpreterService, InterpretOptions } from '@services/pipeline/InterpreterService/IInterpreterService';
import { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService';
import { IStateService } from '@services/state/StateService/IStateService';
import { IParserService } from '@services/pipeline/ParserService/IParserService';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { IPathService } from '@services/fs/PathService/IPathService';
import { MeldNode, TextNode } from '@core/syntax/types';
import { createTextNode, createLocation } from '@tests/utils/testFactories.js';

/**
 * Options for configuring the InterpreterTestFixture
 */
export interface InterpreterTestOptions {
  stateOverrides?: Partial<IStateService>;
  directiveOverrides?: Partial<IDirectiveService>;
  parserOverrides?: Partial<IParserService>;
  resolutionOverrides?: Partial<IResolutionService>;
  circularityOverrides?: Partial<ICircularityService>;
  fsOverrides?: Partial<IFileSystemService>;
  pathOverrides?: Partial<IPathService>;
}

/**
 * A test fixture for simplifying tests related to the InterpreterService.
 * Provides a pre-configured DI context with standard mocks and helpers.
 */
export class InterpreterTestFixture {
  context: TestContextDI;
  interpreterService!: IInterpreterService;
  stateService!: IStateService;
  directiveService!: IDirectiveService;
  parserService!: IParserService;
  resolutionService!: IResolutionService;
  circularityService!: ICircularityService;
  fileSystemService!: IFileSystemService;
  pathService!: IPathService;

  // Store references to mock implementations for easier access in tests
  mockStateService!: IStateService;
  mockDirectiveService!: IDirectiveService;
  mockParserService!: IParserService;
  mockResolutionService!: IResolutionService;
  mockCircularityService!: ICircularityService;
  mockFileSystemService!: IFileSystemService;
  mockPathService!: IPathService;

  // Stores registered client factories and their mock clients
  clientFactories!: Record<string, { factory: any, client: any }>;

  // Private constructor to force creation via static method
  private constructor(context: TestContextDI) {
    this.context = context;
  }

  /**
   * Creates and initializes a new InterpreterTestFixture.
   * Sets up a TestContextDI with standard mocks and registers client factories.
   */
  static async create(options: InterpreterTestOptions = {}): Promise<InterpreterTestFixture> {
    const fixture = new InterpreterTestFixture(TestContextDI.create());
    const helpers = TestContextDI.createTestHelpers();

    // Create mock instances using the MockFactory and provided overrides
    fixture.mockStateService = MockFactory.createStateService(options.stateOverrides);
    fixture.mockDirectiveService = MockFactory.createDirectiveService(options.directiveOverrides);
    fixture.mockParserService = MockFactory.createParserService(options.parserOverrides);
    fixture.mockResolutionService = MockFactory.createResolutionService(options.resolutionOverrides);
    fixture.mockCircularityService = {
      isFileVisited: vi.fn().mockReturnValue(false),
      markFileVisited: vi.fn(),
      markFileUnvisited: vi.fn(),
      detectCircularImport: vi.fn(),
      pushResolution: vi.fn(),
      popResolution: vi.fn(),
      ...options.circularityOverrides,
    } as ICircularityService;
    fixture.mockFileSystemService = MockFactory.createFileSystemService(options.fsOverrides);
    fixture.mockPathService = MockFactory.createPathService(options.pathOverrides);

    // Prepare custom mocks for setupWithStandardMocks
    const customMocks: Record<string, any> = {
      'IStateService': fixture.mockStateService,
      'IDirectiveService': fixture.mockDirectiveService,
      'IParserService': fixture.mockParserService,
      'IResolutionService': fixture.mockResolutionService,
      'ICircularityService': fixture.mockCircularityService,
      'IFileSystemService': fixture.mockFileSystemService,
      'IPathService': fixture.mockPathService,
      // Add other essential mocks if needed, e.g., Logger
      'ILogger': {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
      },
    };

    // Use setupWithStandardMocks to create the context, providing our custom mocks
    fixture.context = helpers.setupWithStandardMocks(customMocks);

    // Register standard client factories AFTER core services are mocked
    // Note: ClientFactoryHelpers might need adjustment if they assume mocks
    // are already registered by setupWithStandardMocks internal calls.
    // For now, assume setupWithStandardMocks handles internal factory mocks if needed.
    // We might need to explicitly register factory mocks here if setup doesn't cover them.
    fixture.clientFactories = ClientFactoryHelpers.registerStandardClientFactories(fixture.context);

    // Resolve the main service and its key dependencies
    // The mocks registered above will be injected
    fixture.interpreterService = await fixture.context.resolve<IInterpreterService>('IInterpreterService');
    fixture.stateService = await fixture.context.resolve<IStateService>('IStateService');
    fixture.directiveService = await fixture.context.resolve<IDirectiveService>('IDirectiveService');
    fixture.parserService = await fixture.context.resolve<IParserService>('IParserService');
    fixture.resolutionService = await fixture.context.resolve<IResolutionService>('IResolutionService');
    fixture.circularityService = await fixture.context.resolve<ICircularityService>('ICircularityService');
    fixture.fileSystemService = await fixture.context.resolve<IFileSystemService>('IFileSystemService');
    fixture.pathService = await fixture.context.resolve<IPathService>('IPathService');

    // Verify the resolved services are indeed our mock instances
    // This helps catch DI configuration issues early
    if (fixture.stateService !== fixture.mockStateService) {
        console.warn('InterpreterTestFixture: Resolved StateService is not the provided mock instance.');
    }
     if (fixture.directiveService !== fixture.mockDirectiveService) {
        console.warn('InterpreterTestFixture: Resolved DirectiveService is not the provided mock instance.');
    }
     if (fixture.parserService !== fixture.mockParserService) {
        console.warn('InterpreterTestFixture: Resolved ParserService is not the provided mock instance.');
    }
      if (fixture.resolutionService !== fixture.mockResolutionService) {
        console.warn('InterpreterTestFixture: Resolved ResolutionService is not the provided mock instance.');
    }
     if (fixture.circularityService !== fixture.mockCircularityService) {
        console.warn('InterpreterTestFixture: Resolved CircularityService is not the provided mock instance.');
    }

    return fixture;
  }

  /**
   * Cleans up the TestContextDI container.
   */
  async cleanup(): Promise<void> {
    await this.context.cleanup();
  }

  /**
   * Helper method to run the interpreter service.
   */
  async interpret(nodes: MeldNode[], options?: InterpretOptions): Promise<IStateService> {
    return this.interpreterService.interpret(nodes, options);
  }

  /**
   * Helper to interpret an array of MeldNodes using the mocked InterpreterService.
   * @param nodes - The nodes to interpret.
   * @param options - Optional interpreter options.
   * @returns The final state after interpretation (typically the mocked stateService).
   */
  async interpretNodes(nodes: MeldNode[], options?: InterpretOptions): Promise<IStateService> {
    // Ensure the service uses the fixture's state service by default
    const interpretOptions = { initialState: this.stateService, ...options };
    return this.interpreterService.interpret(nodes, interpretOptions);
  }

  /**
   * Helper to interpret a single MeldNode.
   * @param node - The node to interpret.
   * @param options - Optional interpreter options.
   * @returns The final state after interpretation.
   */
  async interpretNode(node: MeldNode, options?: InterpretOptions): Promise<IStateService> {
     const interpretOptions = { initialState: this.stateService, ...options };
     // Assuming interpretNode exists or is mocked on the service
     if (!this.interpreterService.interpretNode) {
         throw new Error('interpretNode method not found or mocked on IInterpreterService');
     }
     return this.interpreterService.interpretNode(node, this.stateService, interpretOptions);
  }

  /**
   * Creates a simple TextNode for testing purposes.
   */
  createTextNode(content: string): TextNode {
    return createTextNode(content, createLocation());
  }
} 