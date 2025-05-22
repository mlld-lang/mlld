import { container, Lifecycle, type DependencyContainer } from 'tsyringe';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { DirectiveNode, TextNode, VariableReferenceNode, NodeType } from '@core/ast/types/nodes';
import { DirectiveKind, IDirectiveNode } from '@core/ast/types/interfaces/IDirectiveNode';
import { createTextNode, createVariableReferenceNode, createDirectiveNode } from '@tests/utils/testFactories';
import { createStateServiceMock, createResolutionServiceMock } from '@tests/utils/mocks/serviceMocks';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { FormattingContext } from '@core/types/resolution';
import type { InterpolatableValue } from '@core/ast/types/nodes';

// --- Import REAL Service Implementations for Integration Test ---
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import { StateServiceAdapter } from '@services/state/StateService/StateServiceAdapter';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { PathService } from '@services/fs/PathService/PathService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
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

// --- Import REAL Directive Handlers ---
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler';
import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler';
import { ExecDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/ExecDirectiveHandler';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler';
import { AddDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/AddDirectiveHandler';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';

// Define a minimal logger interface for testing
interface ITestLogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  level?: string; 
}

describe('DirectiveService Integration Tests', () => {
  let testContainer: DependencyContainer;
  let directiveService: DirectiveService;
  let stateService: IStateService;

  beforeEach(async () => {
    // Use manual child container
    testContainer = container.createChildContainer(); 

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
    
    // !!! Register a provider returning null for the parent state dependency !!!
    testContainer.register<IStateService | null>('ParentStateServiceForChild', { 
        useFactory: () => null 
    });
    
    testContainer.register<IStateService>('IStateService', { useClass: StateServiceAdapter }, { lifecycle: Lifecycle.Singleton });

    // Pipeline Services
    testContainer.register<ParserService>('IParserService', { useClass: ParserService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<ResolutionService>('IResolutionService', { useClass: ResolutionService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<ValidationService>('IValidationService', { useClass: ValidationService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<CircularityService>('ICircularityService', { useClass: CircularityService }, { lifecycle: Lifecycle.Singleton });
    testContainer.register<InterpreterServiceClientFactory>(InterpreterServiceClientFactory, { useClass: InterpreterServiceClientFactory }, { lifecycle: Lifecycle.Singleton });
    
    // !!! Register real InterpreterService needed by handlers !!!
    testContainer.register<InterpreterService>('IInterpreterService', { useClass: InterpreterService }, { lifecycle: Lifecycle.Singleton });
    
    testContainer.register<DirectiveService>(DirectiveService, { useClass: DirectiveService }, { lifecycle: Lifecycle.Singleton });
    
    // Register a mock logger using the minimal interface
    const mockLogger: ITestLogger = { 
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        level: 'info' 
    };
    testContainer.register<ITestLogger>('ILogger', { useValue: mockLogger });
    
    // !!! Register the container itself for factories !!!
    testContainer.registerInstance('DependencyContainer', testContainer);

    // --- Register REAL Handlers BEFORE Resolving DirectiveService ---
    testContainer.register('IDirectiveHandler', { useClass: TextDirectiveHandler }, { lifecycle: Lifecycle.Singleton });
    testContainer.register('IDirectiveHandler', { useClass: DataDirectiveHandler }, { lifecycle: Lifecycle.Singleton });
    testContainer.register('IDirectiveHandler', { useClass: PathDirectiveHandler }, { lifecycle: Lifecycle.Singleton });
    testContainer.register('IDirectiveHandler', { useClass: ExecDirectiveHandler }, { lifecycle: Lifecycle.Singleton });
    testContainer.register('IDirectiveHandler', { useClass: RunDirectiveHandler }, { lifecycle: Lifecycle.Singleton });
    testContainer.register('IDirectiveHandler', { useClass: AddDirectiveHandler }, { lifecycle: Lifecycle.Singleton });
    testContainer.register('IDirectiveHandler', { useClass: ImportDirectiveHandler }, { lifecycle: Lifecycle.Singleton });

    // Resolve services from the test container AFTER registration
    directiveService = testContainer.resolve(DirectiveService);
    stateService = testContainer.resolve<IStateService>('IStateService');
    
    // Initialize state with variables needed for interpolation
    await stateService.setTextVar('name', 'World');
    await stateService.setTextVar('user', 'Alice');
    await stateService.setTextVar('val', 'dynamic');
    await stateService.setTextVar('dynamicKey', 'user');
    await stateService.setTextVar('dynamicValue', 'active');
  });

  afterEach(async () => {
    testContainer?.dispose();
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
    // The key 'dynamicKey' should resolve to 'user' based on state.
    expect(result.stateChanges?.variables?.dynamicConfig?.value).toEqual({ user: 'active' }); 
  });
}); 