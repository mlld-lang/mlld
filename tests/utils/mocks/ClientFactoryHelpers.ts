import { vi } from 'vitest';
import type { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MockFactory } from './MockFactory.js';
import { InjectionToken } from 'tsyringe';

// Import the actual client interfaces
import type { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient.js';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient.js';
import type { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient.js';
import type { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import type { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective.js';
import type { IStateServiceClient } from '@services/state/StateService/interfaces/IStateServiceClient.js';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';

/**
 * Register a factory and its client for a service with circular dependencies
 */
export class ClientFactoryHelpers {
  static registerClientFactory<T>(context: TestContextDI, factoryToken: InjectionToken<any>, clientImpl: T): { factory: any, client: T } {
    const { factory, client } = MockFactory.createClientFactory(clientImpl, factoryToken);
    context.registerMock(factoryToken, factory);
    return { factory, client };
  }
  
  /**
   * Register all standard client factories for a test
   * 
   * @param context - The TestContextDI instance
   * @returns A record mapping client names to their factory and client mocks
   */
  static registerStandardClientFactories(context: TestContextDI): Record<string, any> {
    const factories: Record<string, any> = {};
    
    // Path service client
    const pathClient: IPathServiceClient = {
      resolvePath: vi.fn().mockImplementation((path: string) => path),
      normalizePath: vi.fn().mockImplementation((path: string) => path)
    };
    factories.pathClient = ClientFactoryHelpers.registerClientFactory(context, 'PathServiceClientFactory', pathClient);
    
    // File system client
    const fsClient: IFileSystemServiceClient = {
      exists: vi.fn().mockResolvedValue(false),
      isDirectory: vi.fn().mockResolvedValue(false)
    };
    factories.fsClient = ClientFactoryHelpers.registerClientFactory(context, 'FileSystemServiceClientFactory', fsClient);
    
    // Variable reference resolver client
    const vrClient: IVariableReferenceResolverClient = {
      resolve: vi.fn().mockImplementation(async (text: string) => text),
      setResolutionTracker: vi.fn()
    };
    factories.vrClient = ClientFactoryHelpers.registerClientFactory(context, 'VariableReferenceResolverClientFactory', vrClient);
    
    // Directive service client
    const dsClient: IDirectiveServiceClient = {
      supportsDirective: vi.fn().mockReturnValue(true),
      getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data', 'path', 'define', 'run', 'embed', 'import']),
      handleDirective: vi.fn().mockResolvedValue({}), // Return minimal valid DirectiveResult
      validateDirective: vi.fn().mockResolvedValue(undefined)
    };
    factories.dsClient = ClientFactoryHelpers.registerClientFactory(context, DirectiveServiceClientFactory, dsClient);
    
    // Resolution service client for directive
    const rsClient: IResolutionServiceClientForDirective = {
      resolveText: vi.fn().mockImplementation(async (text: string) => text),
      resolveData: vi.fn().mockImplementation(async (ref: string) => ref),
      resolvePath: vi.fn().mockImplementation(async (path: string) => path),
      resolveContent: vi.fn().mockResolvedValue(''),
      resolveInContext: vi.fn().mockImplementation(async (value: any) => 
        typeof value === 'string' ? value : JSON.stringify(value))
    };
    factories.rsClient = ClientFactoryHelpers.registerClientFactory(context, 'ResolutionServiceClientForDirectiveFactory', rsClient);
    
    // State service client
    const ssClient: IStateServiceClient = {
      getStateId: vi.fn().mockReturnValue('test-state-id'),
      getCurrentFilePath: vi.fn().mockReturnValue('/test/file.meld'),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    };
    factories.ssClient = ClientFactoryHelpers.registerClientFactory(context, 'StateServiceClientFactory', ssClient);
    
    // State tracking service client
    const stClient: IStateTrackingServiceClient = {
      registerState: vi.fn(),
      addRelationship: vi.fn(),
      registerRelationship: vi.fn()
    };
    factories.stClient = ClientFactoryHelpers.registerClientFactory(context, 'StateTrackingServiceClientFactory', stClient);
    
    // Interpreter service client
    const interpreterClient: IInterpreterServiceClient = {
      interpret: vi.fn().mockResolvedValue({} as IStateService),
      createChildContext: vi.fn().mockResolvedValue({} as IStateService)
    };
    factories.interpreterClient = ClientFactoryHelpers.registerClientFactory(context, 'InterpreterServiceClientFactory', interpreterClient);
    
    return factories;
  }
  
  /**
   * Verify a factory was used correctly
   */
  static verifyFactoryUsage(factory: any, expectedCalls: number = 1): void {
    expect(factory.createClient).toHaveBeenCalledTimes(expectedCalls);
  }
} 