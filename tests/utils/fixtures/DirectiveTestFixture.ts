import { vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import { ClientFactoryHelpers } from '@tests/utils/mocks/ClientFactoryHelpers.js';
import type { DirectiveNode, SourceLocation, StructuredPath } from '@core/syntax/types/nodes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IDirectiveService, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { DirectiveProcessingContext, DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { createLocation } from '@tests/utils/testFactories.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/path/IPathService.js';

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
  fileSystemService: IFileSystemService;

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
    // Explicitly register mock for IFileSystemService
    fixture.context.registerMock<IFileSystemService>(
      'IFileSystemService',
      MockFactory.createFileSystemService() // Using the standard factory
    );
    // ADDED: Explicitly register mock for IPathService
    fixture.context.registerMock<IPathService>(
      'IPathService',
      MockFactory.createPathService() // Using the standard factory
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
    fixture.fileSystemService = fixture.context.resolveSync('IFileSystemService');
    
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
    const directiveData: Record<string, any> = {
      kind: kind as any,
      identifier,
      ...directiveProps
    };

    // Specific handling for @path directive structure
    if (kind === 'path') {
      // PathDirectiveData expects the path string/object under the 'path' key
      // Simulate the parser creating a StructuredPath object from the raw string
      directiveData.path = {
        raw: value, // The original string value
        structured: {}, // Minimal structured object for the test
        // interpolatedValue: undefined, // Ensure this isn't present for simple strings
      } as StructuredPath;
    } else {
      // For other directives, assume value goes directly on 'value' key
      directiveData.value = value;
    }

    return {
      type: 'Directive',
      directive: directiveData,
      location: location || createLocation(),
    } as DirectiveNode;
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
      directiveNode: node,
      ...executionContextOverrides // Apply top-level context overrides
    };

    return this.handler.execute(context);
  }
} 