import { vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import { ClientFactoryHelpers } from '@tests/utils/mocks/ClientFactoryHelpers.js';
import type { DirectiveNode, SourceLocation } from '@core/syntax/types/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IDirectiveService, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { DirectiveProcessingContext, DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { SourceLocationFactory } from '@core/syntax/types/factories/SourceLocationFactory.js';

/**
 * Options for customizing the DirectiveTestFixture.
 */
export interface DirectiveTestOptions {
  /** Overrides for the mock IStateService */
  stateOverrides?: Partial<IStateService>;
  /** Overrides for the mock IResolutionService */
  resolutionOverrides?: Partial<IResolutionService>;
  /** Overrides for the mock IDirectiveService */
  directiveOverrides?: Partial<IDirectiveService>;
  /** Overrides for the mock IValidationService */
  validationOverrides?: Partial<IValidationService>;
  /** A specific directive handler instance to register and test */
  handler?: IDirectiveHandler;
  /** Additional mocks to register with the context */
  additionalMocks?: Record<string, any>;
}

/**
 * A reusable test fixture for testing directive handlers and related services.
 * Provides a pre-configured TestContextDI with standard mocks.
 */
export class DirectiveTestFixture {
  context: TestContextDI;
  stateService: IStateService;
  resolutionService: IResolutionService;
  directiveService: IDirectiveService;
  validationService: IValidationService;
  handler?: IDirectiveHandler; // The specific handler being tested, if provided

  /**
   * Creates and initializes a new DirectiveTestFixture instance.
   * @param options - Optional configuration for the fixture.
   * @returns A promise that resolves with the initialized fixture.
   */
  static async create(options: DirectiveTestOptions = {}): Promise<DirectiveTestFixture> {
    const fixture = new DirectiveTestFixture();
    
    // Use the setupMinimal helper to get a basic context with essential mocks (like IFileSystem)
    // We will register the core service mocks manually based on options.
    fixture.context = TestContextDI.createTestHelpers().setupMinimal();

    // Register standard client factories first (important for circular dependencies)
    ClientFactoryHelpers.registerStandardClientFactories(fixture.context);

    // Register standard service mocks using MockFactory, applying overrides
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
      MockFactory.createValidationService(options.validationOverrides)
    );
    fixture.context.registerMock<IDirectiveService>(
      'IDirectiveService',
      MockFactory.createDirectiveService(options.directiveOverrides)
    );
    // Register other standard mocks if needed for handler tests (e.g., Parser, Interpreter)
    if (!fixture.context.container.isRegistered('IParserService')) {
       fixture.context.registerMock('IParserService', MockFactory.createParserService());
    }
    if (!fixture.context.container.isRegistered('IInterpreterService')) {
       fixture.context.registerMock('IInterpreterService', MockFactory.createInterpreterService());
    }
    // Register any additional mocks provided
    if (options.additionalMocks) {
      fixture.context.registerMocks(options.additionalMocks);
    }

    // If a specific handler is provided, store it and potentially register it
    // (Registration might happen within DirectiveService mock or be tested directly)
    if (options.handler) {
      fixture.handler = options.handler;
      // Example: If testing DirectiveService routing, mock registerHandler
      // const directiveServiceMock = await fixture.context.resolve<IDirectiveService>('IDirectiveService');
      // vi.spyOn(directiveServiceMock, 'registerHandler').mockImplementation(...) 
    }

    // Resolve the core services into fixture properties for easy access
    // Use resolveSync as initializeAsync was effectively handled by setupMinimal/manual registration
    fixture.stateService = fixture.context.resolveSync('IStateService');
    fixture.resolutionService = fixture.context.resolveSync('IResolutionService');
    fixture.validationService = fixture.context.resolveSync('IValidationService');
    fixture.directiveService = fixture.context.resolveSync('IDirectiveService');
    
    return fixture;
  }

  /**
   * Cleans up the test context resources.
   */
  async cleanup(): Promise<void> {
    await this.context.cleanup();
  }

  /**
   * Helper to create a DirectiveNode for testing.
   */
  createDirectiveNode(
    kind: string, 
    identifier: string, // Use 'identifier' consistent with DirectiveData structure
    value: any, 
    directiveProps: Record<string, any> = {}, // Additional properties for the nested directive object
    location?: SourceLocation // Allow providing a specific location
  ): DirectiveNode {
    return {
      type: 'Directive',
      // The nested 'directive' object holds parsed details
      directive: {
        kind: kind as any, // Cast kind if it might be non-standard for testing
        identifier,
        value,
        ...directiveProps
      },
      location: location || SourceLocationFactory.createDummyLocation('test.meld'),
    } as DirectiveNode; // Cast necessary if kind isn't strictly DirectiveKind
  }

  /**
   * Executes the specific directive handler provided during fixture creation.
   * Throws an error if no handler was provided.
   * 
   * @param node - The directive node to process.
   * @param contextOverrides - Optional overrides for the processing context.
   * @returns The result of the handler execution (DirectiveResult or IStateService).
   */
  async executeHandler(
    node: DirectiveNode, 
    resolutionContextOverrides: Partial<ResolutionContext> = {},
    executionContextOverrides: Partial<DirectiveProcessingContext> = {}
  ): Promise<DirectiveResult | IStateService> {
    if (!this.handler) {
      throw new Error('No directive handler was provided to the fixture during creation. Cannot execute directly.');
    }

    // Construct the context, merging overrides
    const context: DirectiveProcessingContext = {
      state: this.stateService,
      resolutionContext: {
        strict: true, // Default to strict resolution
        filePath: this.stateService.getCurrentFilePath() || '/test/file.meld', // Get path from state or use default
        depth: 0,
        ...resolutionContextOverrides // Apply overrides
      },
      node,
      ...executionContextOverrides // Apply top-level context overrides
    };

    return this.handler.execute(context);
  }
} 