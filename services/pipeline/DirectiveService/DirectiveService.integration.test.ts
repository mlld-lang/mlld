import { container, Lifecycle } from 'tsyringe';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveNode, TextNode, VariableReferenceNode, NodeType } from '@core/syntax/types/nodes';
import { DirectiveKind, IDirectiveNode } from '@core/syntax/types/interfaces/IDirectiveNode.js';
import { createTextNode, createVariableReferenceNode, createDirectiveNode } from '@tests/utils/testFactories.js';
import { createStateServiceMock, createResolutionServiceMock } from '@tests/utils/mocks/serviceMocks.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { Logger } from '@core/utils/logger.js';

// --- Import REAL Service Implementations for Integration Test ---
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import { StateService } from '@services/state/StateService/StateService';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { PathService } from '@services/fs/PathService/PathService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { StateFactory } from '@services/state/StateService/StateFactory';
import { StateEventService } from '@services/state/StateEventService/StateEventService';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import { URLContentResolver } from '@services/resolution/URLContentResolver/URLContentResolver';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory';
// Import factory needed by StateService
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory';
// Import service needed by StateTrackingServiceClientFactory
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService';

describe('DirectiveService Integration Tests', () => {
  let context: TestContextDI;
  let directiveService: DirectiveService;
  let stateService: IStateService;

  beforeEach(async () => {
    // Use isolated container as per TESTS.md recommendations
    context = TestContextDI.createIsolated();
    const testContainer = context.container.getContainer(); // Get the underlying tsyringe container

    // --- Register REAL Services Needed for DirectiveService Integration ---
    // Register dependencies manually, respecting order where needed
    // Filesystem Layer (similar to di-config.ts setup)
    testContainer.register<PathOperationsService>(PathOperationsService, { useClass: PathOperationsService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<NodeFileSystem>('IFileSystem', { useClass: NodeFileSystem }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<ProjectPathResolver>(ProjectPathResolver, { useClass: ProjectPathResolver }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<URLContentResolver>('IURLContentResolver', { useClass: URLContentResolver }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<PathService>('IPathService', { useClass: PathService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<FileSystemService>('IFileSystemService', { useClass: FileSystemService }, { lifecycle: Lifecycle.Singleton });
    
    // Filesystem Factories (needed to break cycles)
    testContainer.register<PathServiceClientFactory>(PathServiceClientFactory, { useClass: PathServiceClientFactory }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<FileSystemServiceClientFactory>(FileSystemServiceClientFactory, { useClass: FileSystemServiceClientFactory }, { lifecycle: Lifecycle.Singleton });

    // State Layer
    testContainer.register<StateFactory>(StateFactory, { useClass: StateFactory }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<StateEventService>('IStateEventService', { useClass: StateEventService }, { lifecycle: Lifecycle.Singleton });
    // StateTrackingService and its factory (dependency for StateService)
    testContainer.register<StateTrackingService>(StateTrackingService, { useClass: StateTrackingService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<StateTrackingServiceClientFactory>(StateTrackingServiceClientFactory, { useClass: StateTrackingServiceClientFactory }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<StateService>('IStateService', { useClass: StateService }, { lifecycle: Lifecycle.Singleton });

    // Pipeline Services
    testContainer.register<ParserService>('IParserService', { useClass: ParserService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<ResolutionService>('IResolutionService', { useClass: ResolutionService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<ValidationService>('IValidationService', { useClass: ValidationService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<CircularityService>('ICircularityService', { useClass: CircularityService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<InterpreterServiceClientFactory>(InterpreterServiceClientFactory, { useClass: InterpreterServiceClientFactory }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<DirectiveService>(DirectiveService, { useClass: DirectiveService }, { lifecycle: Lifecycle.Singleton });
    
    // Register a mock logger for DirectiveService dependency
    const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        level: 'info'
    };
    testContainer.register<Logger>('DirectiveLogger', { useValue: mockLogger });
    
    // Resolve services from the test container AFTER registration
    directiveService = testContainer.resolve(DirectiveService);
    stateService = testContainer.resolve<IStateService>('IStateService');
    
    // Manually break cycles for FS/Path if needed after resolution ( mimicking di-config )
    // This is complex and brittle, ideally DI handles it. 
    // If tests fail, this might need adjustment based on specific errors.
    try {
      const fs = testContainer.resolve<FileSystemService>('IFileSystemService');
      const ps = testContainer.resolve<PathService>('IPathService');
      const pscFactory = testContainer.resolve(PathServiceClientFactory);
      const fscFactory = testContainer.resolve(FileSystemServiceClientFactory);
      if (fs && !(fs as any).pathClient) (fs as any).pathClient = pscFactory.createClient();
      if (ps && !(ps as any).fsClientFactory) (ps as any).fsClientFactory = fscFactory;
      if (fs && !(fs as any).factoryInitialized) (fs as any).factoryInitialized = true;
      if (ps && !(ps as any).factoryInitialized) (ps as any).factoryInitialized = true;
    } catch (e) {
        console.warn("Manual cycle breaking for FS/Path failed during test setup:", e);
    }

    // Initialize state with variables needed for interpolation
    await stateService.setTextVar('name', 'World');
    await stateService.setTextVar('user', 'Alice');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should correctly process @text directive with interpolation', async () => {
    // Setup state
    await stateService.setTextVar('name', 'World');
    const textNode = createDirectiveNode('text', { identifier: 'greeting', value: 'Hello {{name}}!' });
    
    // Create DirectiveProcessingContext
    const processingContext: DirectiveProcessingContext = {
      state: stateService,
      resolutionContext: ResolutionContextFactory.create(stateService, 'test-text.meld'),
      formattingContext: {} as FormattingContext, // Use placeholder empty object
      executionContext: undefined, // Not needed for text
      directiveNode: textNode
    };

    // Call handleDirective
    const result = await directiveService.handleDirective(textNode, processingContext);
    // Explicitly check return type - should be IStateService for @text
    expect(result).toHaveProperty('getTextVar'); // Basic check for IStateService
    const resultState = result as IStateService; 

    const resolvedValue = await resultState.getTextVar('greeting');
    expect(resolvedValue?.value).toBe('Hello World!'); // Check resolved value
  });

  it('should correctly process @data directive with interpolation in string value', async () => {
    // Setup state
    await stateService.setTextVar('val', 'dynamic');
    const dataNode = createDirectiveNode('data', { identifier: 'config', source: 'literal', value: '{ "key": "{{val}}" }' });

    // Create DirectiveProcessingContext
    const processingContext: DirectiveProcessingContext = {
      state: stateService,
      resolutionContext: ResolutionContextFactory.create(stateService, 'test-data.meld'),
      formattingContext: {} as FormattingContext, // Use placeholder empty object
      executionContext: undefined, // Not needed for data
      directiveNode: dataNode
    };

    // Call handleDirective
    const result = await directiveService.handleDirective(dataNode, processingContext);
    // Handle both IStateService and DirectiveResult return types
    let resultState: IStateService;
    if ('state' in result && 'replacement' in result) { // Check if DirectiveResult
      resultState = result.state;
    } else {
      resultState = result as IStateService; // Assume IStateService
    }
    expect(resultState).toBeDefined();
    expect(resultState).toHaveProperty('getDataVar'); // Check state has method

    const resolvedValue = await resultState.getDataVar('config');
    expect(resolvedValue?.value).toEqual({ key: 'dynamic' }); // Check resolved value
  });

  it('should correctly process @data directive with interpolation in object key (if supported) and value', async () => {
    // Setup state
    await stateService.setTextVar('dynamicKey', 'user');
    await stateService.setTextVar('dynamicValue', 'active');
    const dataNode = createDirectiveNode('data', { identifier: 'dynamicConfig', source: 'literal', value: '{ "{{dynamicKey}}": "{{dynamicValue}}" }' });

    // Create DirectiveProcessingContext
    const processingContext: DirectiveProcessingContext = {
      state: stateService,
      resolutionContext: ResolutionContextFactory.create(stateService, 'test-data-dynamic.meld'),
      formattingContext: {} as FormattingContext, // Use placeholder empty object
      executionContext: undefined,
      directiveNode: dataNode
    };

    // Call handleDirective
    const result = await directiveService.handleDirective(dataNode, processingContext);
    // Handle both IStateService and DirectiveResult return types
    let resultState: IStateService;
    if ('state' in result && 'replacement' in result) { // Check if DirectiveResult
      resultState = result.state;
    } else {
      resultState = result as IStateService; // Assume IStateService
    }
    expect(resultState).toBeDefined();
    expect(resultState).toHaveProperty('getDataVar'); // Check state has method
    
    const resolvedValue = await resultState.getDataVar('dynamicConfig');
    // Assuming keys are NOT interpolated in current implementation, value is
    expect(resolvedValue?.value).toEqual({ '{{dynamicKey}}': 'active' }); 
  });
}); 