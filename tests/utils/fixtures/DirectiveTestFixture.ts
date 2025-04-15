import { vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import { ClientFactoryHelpers } from '@tests/utils/mocks/ClientFactoryHelpers.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IDirectiveService, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { DirectiveNode, DirectiveProcessingContext } from '@core/types/index.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/interfaces/DirectiveTypes.js';
import { SourceLocationFactory } from '@tests/utils/factories/NodeFactory.js';

/**
 * Options for configuring the DirectiveTestFixture
 */
export interface DirectiveTestOptions {
  stateOverrides?: Partial<IStateService>;
  resolutionOverrides?: Partial<IResolutionService>;
  directiveServiceOverrides?: Partial<IDirectiveService>; // Renamed for clarity
  validationOverrides?: Partial<IValidationService>;
  handler?: IDirectiveHandler; // The specific handler being tested
  handlerToken?: string; // Optional token to register the handler under
  otherMocks?: Record<string, any>; // For any other specific mocks needed
}

/**
 * A test fixture for simplifying tests related to Directive Handlers and DirectiveService.
 * Provides a pre-configured DI context with standard mocks and helpers.
 */
export class DirectiveTestFixture {
  context: TestContextDI;
  stateService: IStateService;
  resolutionService: IResolutionService;
  directiveService: IDirectiveService;
  validationService: IValidationService;
  handler?: IDirectiveHandler;

  // Private constructor to force creation via static method
  private constructor(context: TestContextDI) {
    this.context = context;
  }

  /**
   * Asynchronously creates and initializes a new DirectiveTestFixture.
   * @param options - Configuration options for the fixture and its mocks.
   * @returns A promise that resolves to the initialized DirectiveTestFixture.
   */
  static async create(options: DirectiveTestOptions = {}): Promise<DirectiveTestFixture> {
    const helpers = TestContextDI.createTestHelpers();
    // Start with standard mocks, but allow overriding everything via options
    const context = helpers.setupWithStandardMocks(options.otherMocks || {}, { isolatedContainer: true });
    
    // Await initial context setup which registers standard mocks
    // Accessing initPromise directly causes lint errors, await a resolve instead
    await context.resolve('IFileSystemService'); // Resolve something simple to ensure init completes

    const fixture = new DirectiveTestFixture(context);

    // --- Mock Registration with Overrides ---
    
    // Register standard client factories (important for circular dependencies)
    ClientFactoryHelpers.registerStandardClientFactories(fixture.context);

    // Register/Override core services with potential overrides
    fixture.context.registerMock<IStateService>(
      'IStateService', 
      MockFactory.createStateService(options.stateOverrides)
    );
    fixture.context.registerMock<IResolutionService>(
      'IResolutionService',
      MockFactory.createResolutionService(options.resolutionOverrides)
    );
    fixture.context.registerMock<IValidationService>(
      'IValidationService',
      {
        validate: vi.fn().mockResolvedValue(undefined), // Default mock for validate
        registerValidator: vi.fn(),
        removeValidator: vi.fn(),
        getRegisteredDirectiveKinds: vi.fn().mockReturnValue([]),
        ...options.validationOverrides // Apply specific overrides for validation
      } as IValidationService // Cast necessary as we might not override all methods
    );
    fixture.context.registerMock<IDirectiveService>(
        'IDirectiveService',
        MockFactory.createDirectiveService(options.directiveServiceOverrides)
    );

    // Register the specific handler being tested, if provided
    if (options.handler) {
      fixture.handler = options.handler;
      const handlerToken = options.handlerToken || `handler:${options.handler.kind}`; // Default token
      fixture.context.registerMock(handlerToken, options.handler);
      // Also register it with the DirectiveService mock if we expect routing tests
      const directiveServiceMock = await fixture.context.resolve<IDirectiveService>('IDirectiveService');
      vi.spyOn(directiveServiceMock, 'registerHandler').mockImplementation((h) => {
          if (h.kind === options.handler?.kind) {
              // Allow registering the test handler
          } else {
              // Optionally mock other registrations
          }
      });
       vi.spyOn(directiveServiceMock, 'hasHandler').mockImplementation((kind) => kind === options.handler?.kind);
       // Register the actual handler with the mock service
       directiveServiceMock.registerHandler(options.handler);
    }

    // --- Resolve Services ---
    // Resolve core services needed by the fixture/tests
    fixture.directiveService = await fixture.context.resolve('IDirectiveService');
    fixture.stateService = await fixture.context.resolve('IStateService');
    fixture.resolutionService = await fixture.context.resolve('IResolutionService');
    fixture.validationService = await fixture.context.resolve('IValidationService');
    
    return fixture;
  }

  /**
   * Cleans up the TestContextDI container.
   */
  async cleanup(): Promise<void> {
    await this.context.cleanup();
  }

  /**
   * Helper to create a DirectiveNode for testing.
   */
  createDirectiveNode(
    kind: string, 
    name: string, 
    value: any, 
    directiveProps: Record<string, any> = {}, // Additional properties for the nested directive object
    nodeOptions: Partial<DirectiveNode> = {} // Options for the top-level node
  ): DirectiveNode {
    return {
      type: 'Directive',
      kind,
      // The nested 'directive' object often holds parsed details
      directive: {
        kind,
        identifier: name, // Assuming 'name' corresponds to 'identifier'
        value,
        source: 'literal', // Default source
        ...directiveProps
      },
      // Standard node properties
      name: name, // Keep top-level name for convenience if used elsewhere
      value: value, // Keep top-level value for convenience if used elsewhere
      location: nodeOptions.location || SourceLocationFactory.createDummyLocation('test.meld'),
      ...nodeOptions
    } as DirectiveNode;
  }
  
  /**
   * Helper to execute the registered directive handler directly.
   * Requires a handler to be provided during fixture creation.
   */
  async executeHandler(
    node: DirectiveNode, 
    contextOverrides: Partial<DirectiveProcessingContext> = {}
  ): Promise<DirectiveResult | IStateService> {
    if (!this.handler) {
      throw new Error('No directive handler registered for direct execution. Use options.handler when creating the fixture.');
    }

    // Create a default resolution context if not overridden
    const resolutionContext = contextOverrides.resolutionContext || {
        strict: true,
        filePath: this.stateService.getCurrentFilePath() || '/test/file.meld',
        // Add other default context fields if necessary
    };

    const processingContext: DirectiveProcessingContext = {
      state: this.stateService,
      resolutionContext: resolutionContext,
      directiveNode: node,
      formattingContext: contextOverrides.formattingContext || {
          isBlock: false,
          preserveLiteralFormatting: false,
          preserveWhitespace: false,
      },
      // Allow overriding any part of the context
      ...contextOverrides
    };
    
    return this.handler.execute(processingContext);
  }

  /**
   * Helper to process a directive through the mocked DirectiveService.
   * Useful for testing the routing and interaction logic within DirectiveService itself.
   */
  async processDirectiveViaService(node: DirectiveNode): Promise<IStateService | DirectiveResult> {
     const currentFilePath = this.stateService.getCurrentFilePath() || '/test/file.meld';
     const processingContext: DirectiveProcessingContext = {
            state: this.stateService,
            directiveNode: node,
            resolutionContext: {
                strict: true,
                filePath: currentFilePath,
            },
            formattingContext: {
                 isBlock: false,
                 preserveLiteralFormatting: false,
                 preserveWhitespace: false,
             },
        };
    // Assumes DirectiveService.handleDirective is the method that routes
    return this.directiveService.handleDirective(node, processingContext);
  }
} 