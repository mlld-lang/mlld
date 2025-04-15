import { vi } from 'vitest';
import type { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MockFactory } from './MockFactory.js';

// Import the actual client interfaces
import type { IPathServiceClient } from '@services/fs/PathService/factories/IPathServiceClient.js';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/factories/IFileSystemServiceClient.js';
import type { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/factories/IVariableReferenceResolverClient.js';
import type { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/factories/IDirectiveServiceClient.js';
import type { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective.js';
import type { IStateServiceClient } from '@services/state/StateService/factories/IStateServiceClient.js';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/factories/IStateTrackingServiceClient.js';

export class ClientFactoryHelpers {
  /**
   * Register a factory and its client for a service with circular dependencies
   */
  static registerClientFactory<T>(context: TestContextDI, factoryToken: string, clientImpl: T): { factory: any, client: T } {
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
  static registerStandardClientFactories(context: TestContextDI): Record<string, { factory: any; client: any }> {
    const factories: Record<string, { factory: any; client: any }> = {};
    
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
      getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data', 'path', 'define', 'run', 'embed', 'import'])
    };
    factories.dsClient = ClientFactoryHelpers.registerClientFactory(context, 'DirectiveServiceClientFactory', dsClient);
    
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
    
    return factories;
  }
  
  /**
   * Verify a factory was used correctly
   */
  static verifyFactoryUsage(factory: any, expectedCalls: number = 1): void {
    expect(factory.createClient).toHaveBeenCalledTimes(expectedCalls);
  }
} 