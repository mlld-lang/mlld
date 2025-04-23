import { vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { MockFactory } from '@tests/utils/mocks/MockFactory';
import { ClientFactoryHelpers } from '@tests/utils/mocks/ClientFactoryHelpers';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IInterpreterService, InterpreterOptions } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { MeldNode, TextNode } from '@core/syntax/types/index';
import { createTextNode, createLocation } from '@tests/utils/testFactories';

/**
 * Options for configuring the InterpreterTestFixture
 */
export interface InterpreterTestOptions {
  interpreterOverrides?: Partial<IInterpreterService>;
  stateOverrides?: Partial<IStateService>;
  directiveServiceOverrides?: Partial<IDirectiveService>;
  parserOverrides?: Partial<IParserService>;
  resolutionOverrides?: Partial<IResolutionService>;
  fsOverrides?: Partial<IFileSystemService>;
  pathOverrides?: Partial<IPathService>;
  circularityOverrides?: Partial<ICircularityService>;
  otherMocks?: Record<string, any>; // For any other specific mocks needed
}

/**
 * A test fixture for simplifying tests related to the InterpreterService.
 * Provides a pre-configured DI context with standard mocks and helpers.
 */
export class InterpreterTestFixture {
  context!: TestContextDI;
  interpreterService!: IInterpreterService;
  stateService!: IStateService;
  directiveService!: IDirectiveService;
  parserService!: IParserService;
  resolutionService!: IResolutionService;
  fsService!: IFileSystemService;
  pathService!: IPathService;
  circularityService!: ICircularityService;

  // Private constructor to force creation via static method
  private constructor(context: TestContextDI) {
    this.context = context;
  }

  /**
   * Asynchronously creates and initializes a new InterpreterTestFixture.
   * @param options - Configuration options for the fixture and its mocks.
   * @returns A promise that resolves to the initialized InterpreterTestFixture.
   */
  static async create(options: InterpreterTestOptions = {}): Promise<InterpreterTestFixture> {
    const helpers = TestContextDI.createTestHelpers();
    // Start with standard mocks, allowing overrides
    const context = helpers.setupWithStandardMocks(options.otherMocks || {}, { isolatedContainer: true });
    
    // Ensure initialization completes
    await context.resolve('IFileSystemService'); // Resolve something simple 

    const fixture = new InterpreterTestFixture(context);

    // --- Mock Registration with Overrides ---
    ClientFactoryHelpers.registerStandardClientFactories(fixture.context);

    fixture.context.registerMock<IInterpreterService>(
      'IInterpreterService',
      MockFactory.createInterpreterService(options.interpreterOverrides)
    );
    fixture.context.registerMock<IStateService>(
      'IStateService', 
      MockFactory.createStateService(options.stateOverrides)
    );
    fixture.context.registerMock<IDirectiveService>(
        'IDirectiveService',
        MockFactory.createDirectiveService(options.directiveServiceOverrides)
    );
    fixture.context.registerMock<IParserService>(
        'IParserService',
        MockFactory.createParserService(options.parserOverrides)
    );
    fixture.context.registerMock<IResolutionService>(
        'IResolutionService',
        MockFactory.createResolutionService(options.resolutionOverrides)
    );
     fixture.context.registerMock<IFileSystemService>(
        'IFileSystemService',
        MockFactory.createFileSystemService(options.fsOverrides)
    );
     fixture.context.registerMock<IPathService>(
        'IPathService',
        MockFactory.createPathService(options.pathOverrides)
    );
     fixture.context.registerMock<ICircularityService>(
        'ICircularityService',
        { // Assuming no standard mock factory for this yet
            markFileVisited: vi.fn(),
            isFileVisited: vi.fn().mockReturnValue(false),
            clearVisitedFiles: vi.fn(),
            getVisitedFiles: vi.fn().mockReturnValue([]),
            ...(options.circularityOverrides || {})
        } as ICircularityService
    );
    
    // --- Resolve Services ---
    fixture.interpreterService = await fixture.context.resolve('IInterpreterService');
    fixture.stateService = await fixture.context.resolve('IStateService');
    fixture.directiveService = await fixture.context.resolve('IDirectiveService');
    fixture.parserService = await fixture.context.resolve('IParserService');
    fixture.resolutionService = await fixture.context.resolve('IResolutionService');
    fixture.fsService = await fixture.context.resolve('IFileSystemService');
    fixture.pathService = await fixture.context.resolve('IPathService');
    fixture.circularityService = await fixture.context.resolve('ICircularityService');

    // --- Default Mock Behavior Setup (Optional) ---
    // Example: Make directive service handle directives by returning the state
    vi.spyOn(fixture.directiveService, 'handleDirective').mockImplementation(async (node, processCtx) => {
        // Default behavior: simply return the state
        return processCtx.state;
    });
     // Example: Make state service return itself on clone
    vi.spyOn(fixture.stateService, 'clone').mockImplementation(() => fixture.stateService);
    
    return fixture;
  }

  /**
   * Cleans up the TestContextDI container.
   */
  async cleanup(): Promise<void> {
    await this.context.cleanup();
  }

  /**
   * Helper to interpret an array of MeldNodes using the mocked InterpreterService.
   * @param nodes - The nodes to interpret.
   * @param options - Optional interpreter options.
   * @returns The final state after interpretation (typically the mocked stateService).
   */
  async interpretNodes(nodes: MeldNode[], options?: InterpreterOptions): Promise<IStateService> {
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
  async interpretNode(node: MeldNode, options?: InterpreterOptions): Promise<IStateService> {
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