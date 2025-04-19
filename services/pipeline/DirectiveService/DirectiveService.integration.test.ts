import { container, Lifecycle } from 'tsyringe';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
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
import type { DirectiveProcessingContext } from '@core/types/index.js';
import type { FormattingContext } from '@core/types/resolution.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';

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

// Define a minimal logger interface for testing
interface ITestLogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  level?: string; 
}

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
    
    // Register a mock logger using the minimal interface
    const mockLogger: ITestLogger = { 
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        level: 'info' 
    };
    // Register using the interface type
    testContainer.register<ITestLogger>('ILogger', { useValue: mockLogger });
    
    // Resolve services from the test container AFTER registration
    directiveService = testContainer.resolve(DirectiveService);
    stateService = testContainer.resolve<IStateService>('IStateService');
    
    // NOTE: Manual cycle breaking removed. Dependencies should be handled by `delay()` now.

    // Initialize state with variables needed for interpolation
    await stateService.setTextVar('name', 'World');
    await stateService.setTextVar('user', 'Alice');
    await stateService.setTextVar('val', 'dynamic');
    await stateService.setTextVar('dynamicKey', 'user');
    await stateService.setTextVar('dynamicValue', 'active');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should correctly process @text directive with interpolation', async () => {
    // Setup state
    await stateService.setTextVar('name', 'World');
    
    // Construct InterpolatableValue for the text directive
    const textValue: InterpolatableValue = [
      createTextNode('Hello '),
      createVariableReferenceNode('name', 'text'),
      createTextNode('!')
    ];
    const textNode = createDirectiveNode('text', { identifier: 'greeting', value: textValue });
    
    // Create DirectiveProcessingContext
    const processingContext: DirectiveProcessingContext = {
      state: stateService,
      resolutionContext: ResolutionContextFactory.create(stateService, 'test-text.meld'),
      formattingContext: {} as FormattingContext, 
      executionContext: undefined, 
      directiveNode: textNode
    };

    // Call handleDirective
    const result = await directiveService.handleDirective(textNode, processingContext);
    
    // Assert on the DirectiveResult
    expect(result).toBeDefined();
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables?.greeting).toBeDefined();
    expect(result.stateChanges?.variables?.greeting?.value).toBe('Hello World!');
  });

  it('should correctly process @data directive with interpolation in string value', async () => {
    // Setup state
    await stateService.setTextVar('val', 'dynamic');

    // Construct InterpolatableValue for the data string value
    const dataValue: InterpolatableValue = [
      createTextNode('{ "key": "'),
      createVariableReferenceNode('val', 'text'), // Assuming 'val' is text type
      createTextNode('" }')
    ];
    // Pass the array to the value property
    const dataNode = createDirectiveNode('data', { identifier: 'config', source: 'literal', value: dataValue });

    // Create DirectiveProcessingContext
    const processingContext: DirectiveProcessingContext = {
      state: stateService,
      resolutionContext: ResolutionContextFactory.create(stateService, 'test-data.meld'),
      formattingContext: {} as FormattingContext, 
      executionContext: undefined, 
      directiveNode: dataNode
    };

    // Call handleDirective
    const result = await directiveService.handleDirective(dataNode, processingContext);

    // Assert on the DirectiveResult
    expect(result).toBeDefined();
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables?.config).toBeDefined();
    // The data handler should resolve the value string and parse it
    expect(result.stateChanges?.variables?.config?.value).toEqual({ key: 'dynamic' }); 
  });

  it('should correctly process @data directive with interpolation in object key (if supported) and value', async () => {
    // Setup state
    await stateService.setTextVar('dynamicKey', 'user');
    await stateService.setTextVar('dynamicValue', 'active');

    // Construct InterpolatableValue for the complex data string
    const complexDataValue: InterpolatableValue = [
      createTextNode('{ "'),
      createVariableReferenceNode('dynamicKey', 'text'), // Assuming 'dynamicKey' is text
      createTextNode('": "'),
      createVariableReferenceNode('dynamicValue', 'text'), // Assuming 'dynamicValue' is text
      createTextNode('" }')
    ];
    const dataNode = createDirectiveNode('data', { identifier: 'dynamicConfig', source: 'literal', value: complexDataValue });

    // Create DirectiveProcessingContext
    const processingContext: DirectiveProcessingContext = {
      state: stateService,
      resolutionContext: ResolutionContextFactory.create(stateService, 'test-data-dynamic.meld'),
      formattingContext: {} as FormattingContext, 
      executionContext: undefined,
      directiveNode: dataNode
    };

    // Call handleDirective
    const result = await directiveService.handleDirective(dataNode, processingContext);

    // Assert on the DirectiveResult
    expect(result).toBeDefined();
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables?.dynamicConfig).toBeDefined();
    // If keys ARE NOT interpolated by the data handler/resolver, this should pass.
    // If keys ARE interpolated, the expected result would need to change.
    expect(result.stateChanges?.variables?.dynamicConfig?.value).toEqual({ user: 'active' }); // EXPECTATION UPDATED ASSUMING KEY IS RESOLVED
  });
}); 