import { container, Lifecycle } from 'tsyringe';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { DirectiveService } from './DirectiveService';
import { IStateService } from '@services/state/StateService/IStateService';
import { DirectiveNode, TextNode, VariableReferenceNode, NodeType } from '@core/syntax/types/nodes';
import { DirectiveKind, IDirectiveNode } from '@core/syntax/types/interfaces/IDirectiveNode';
import { createTextNode, createVariableReferenceNode } from '@tests/utils/testFactories';

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
    const textNode: IDirectiveNode = {
      type: 'Directive',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } },
      directive: {
        kind: 'text',
        identifier: 'greeting',
        source: 'literal',
        value: [
          createTextNode('Hello '),
          createVariableReferenceNode('name', 'text'),
        ],
      },
    };

    // Create DirectiveContext
    const contextArgs = { currentFilePath: 'test-text.meld', state: stateService };
    const resultState = await directiveService.processDirective(textNode, contextArgs);
    const resolvedValue = await resultState.getTextVar('greeting');

    // Check the .value property
    expect(resolvedValue?.value).toBe('Hello World');
  });

  it('should correctly process @data directive with interpolation in string value', async () => {
    const dataNode: IDirectiveNode = {
      type: 'Directive',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 45 } },
      directive: {
        kind: 'data',
        identifier: 'config',
        source: 'literal',
        value: {
          greeting: [
            createTextNode('Hello '),
            createVariableReferenceNode('user', 'text'),
          ],
        },
      },
    };

    // Create DirectiveContext
    const contextArgs = { currentFilePath: 'test-data.meld', state: stateService };
    const resultState = await directiveService.processDirective(dataNode, contextArgs);
    const resolvedValue = await resultState.getDataVar('config');

    // The handler resolves the *value* (`InterpolatableValue[]`),
    // the result stored should be the object with the resolved string
    // Check the .value property
    expect(resolvedValue?.value).toEqual({ greeting: 'Hello Alice' });
  });

   it('should correctly process @data directive with interpolation in object key (if supported) and value', async () => {
    // Setup state
    await stateService.setTextVar('keyName', 'dynamicGreeting');
    await stateService.setTextVar('userName', 'Bob');

    // Note: Interpolation in object keys is NOT standard JSON and
    // depends on how DataDirectiveHandler handles complex object literals.
    // Assuming for this test it *might* work via custom logic or future enhancement.
    // If it's not meant to work, this test should be adjusted or removed.
    // For now, let's assume it passes through the InterpolatableValue structure.
     const dataNode: IDirectiveNode = {
        type: 'Directive',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 60 } },
        directive: {
            kind: 'data',
            identifier: 'dynamicConfig',
            source: 'literal',
            // Hypothetical structure allowing interpolatable keys
            value: {
                 // Key itself might need a special representation if intended to be dynamic
                 // This is complex - let's stick to value interpolation for now.
                 // Revised to test only value interpolation within a complex object
                 fixedGreeting: [
                    createTextNode('Hi '),
                    createVariableReferenceNode('userName', 'text'),
                 ],
                 nested: {
                    message: [
                         createTextNode('User is '),
                         createVariableReferenceNode('userName', 'text'),
                    ]
                 }
            },
        },
    };

    // Create DirectiveContext
    const contextArgs = { currentFilePath: 'test-data-dynamic.meld', state: stateService };
    const resultState = await directiveService.processDirective(dataNode, contextArgs);
    const resolvedValue = await resultState.getDataVar('dynamicConfig');

    // Check the .value property
    expect(resolvedValue?.value).toEqual({
        fixedGreeting: 'Hi Bob',
        nested: {
            message: 'User is Bob'
        }
     });
  });


}); 