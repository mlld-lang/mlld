import { vi } from 'vitest';
import type { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient';
import { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient';
import type { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective';
import type { IStateServiceClient } from '@services/state/StateService/interfaces/IStateServiceClient';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';

/**
 * Updated registerFactories method for TestContextDI
 * This is a reference implementation that should be copied into TestContextDI.ts
 */
export function registerFactories(container: any, fs: any) {
  // Register PathServiceClientFactory mock
  const mockPathServiceClientFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockPathClient: IPathServiceClient = {
        resolvePath: vi.fn().mockImplementation((path: string) => path),
        normalizePath: vi.fn().mockImplementation((path: string) => path)
      };
      return mockPathClient;
    })
  };
  
  // Register FileSystemServiceClientFactory mock
  const mockFileSystemServiceClientFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockFileSystemClient: IFileSystemServiceClient = {
        exists: vi.fn().mockImplementation(async (path: string) => {
          try {
            return await fs.exists(path);
          } catch (error) {
            return false;
          }
        }),
        isDirectory: vi.fn().mockImplementation(async (path: string) => {
          try {
            const stats = await fs.stat(path);
            return stats.isDirectory();
          } catch (error) {
            return false;
          }
        })
      };
      return mockFileSystemClient;
    })
  };
  
  // Register VariableReferenceResolverClientFactory mock
  const mockVariableReferenceResolverClientFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockVariableReferenceResolverClient: IVariableReferenceResolverClient = {
        resolve: vi.fn().mockImplementation(async (text: string, context: any) => {
          // Simple mock implementation that returns the text unchanged
          return text;
        }),
        setResolutionTracker: vi.fn()
      };
      return mockVariableReferenceResolverClient;
    })
  };
  
  // Register DirectiveServiceClientFactory mock
  const mockDirectiveServiceClientFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockDirectiveServiceClient: IDirectiveServiceClient = {
        supportsDirective: vi.fn().mockImplementation((kind: string) => {
          // Default to supporting all directives in tests
          return true;
        }),
        getSupportedDirectives: vi.fn().mockImplementation(() => {
          // Return common directive kinds
          return ['text', 'data', 'path', 'define', 'run', 'embed', 'import'];
        })
      };
      return mockDirectiveServiceClient;
    })
  };
  
  // Register ResolutionServiceClientForDirectiveFactory mock
  const mockResolutionServiceClientForDirectiveFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockResolutionServiceClientForDirective: IResolutionServiceClientForDirective = {
        resolveText: vi.fn().mockImplementation(async (text: string, context: any) => {
          // Simple mock implementation that returns the text unchanged
          return text;
        }),
        resolveData: vi.fn().mockImplementation(async (ref: string, context: any) => {
          // Simple mock implementation that returns the ref as a string
          return ref;
        }),
        resolvePath: vi.fn().mockImplementation(async (path: string, context: any) => {
          // Simple mock implementation that returns the path unchanged
          return path;
        }),
        resolveContent: vi.fn().mockImplementation(async (nodes: any[], context: any) => {
          // Simple mock implementation that returns empty string
          return '';
        }),
        resolveInContext: vi.fn().mockImplementation(async (value: string | any, context: any) => {
          // Simple mock implementation that returns the value as a string
          return typeof value === 'string' ? value : JSON.stringify(value);
        })
      };
      return mockResolutionServiceClientForDirective;
    })
  };
  
  // Register StateServiceClientFactory mock
  const mockStateServiceClientFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockStateServiceClient: IStateServiceClient = {
        getStateId: vi.fn().mockImplementation(() => 'test-state-id'),
        getCurrentFilePath: vi.fn().mockImplementation(() => '/test/file.meld'),
        getAllTextVars: vi.fn().mockImplementation(() => new Map()),
        getAllDataVars: vi.fn().mockImplementation(() => new Map()),
        getAllPathVars: vi.fn().mockImplementation(() => new Map()),
        getAllCommands: vi.fn().mockImplementation(() => new Map()),
        isTransformationEnabled: vi.fn().mockImplementation(() => false)
      };
      return mockStateServiceClient;
    })
  };
  
  // Register StateTrackingServiceClientFactory mock
  const mockStateTrackingServiceClientFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockStateTrackingServiceClient: IStateTrackingServiceClient = {
        registerState: vi.fn(),
        addRelationship: vi.fn(),
        registerRelationship: vi.fn(),
        registerEvent: vi.fn(),
        hasState: vi.fn().mockReturnValue(true),
        getStateMetadata: vi.fn().mockReturnValue({
          id: 'test-state-id',
          source: 'test',
          createdAt: Date.now(),
          transformationEnabled: false
        }),
        getParentState: vi.fn().mockReturnValue('parent-state-id'),
        getChildStates: vi.fn().mockReturnValue(['child-state-id']),
        getRelationships: vi.fn().mockReturnValue([
          { sourceId: 'parent-state-id', targetId: 'child-state-id', type: 'parent-child' }
        ]),
        getStateDescendants: vi.fn().mockReturnValue(['child-state-id'])
      };
      return mockStateTrackingServiceClient;
    })
  };
  
  // Register InterpreterServiceClientFactory mock
  const mockInterpreterServiceClientFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockInterpreterServiceClient: IInterpreterServiceClient = {
        createChildContext: vi.fn().mockImplementation(async (parentState: any, filePath?: string, options?: any) => {
          // Create a simple mock state that's a clone of the parent state
          return parentState.clone ? parentState.clone() : parentState;
        }),
        interpret: vi.fn().mockImplementation(async (nodes: any[], options?: any) => {
          // Return initialState or a simple mock state
          return options?.initialState || { 
            clone: () => ({}) as any,
            createChildState: () => ({}) as any
          };
        })
      };
      return mockInterpreterServiceClient;
    })
  };
  
  container.registerMock('PathServiceClientFactory', mockPathServiceClientFactory);
  container.registerMock('FileSystemServiceClientFactory', mockFileSystemServiceClientFactory);
  container.registerMock('VariableReferenceResolverClientFactory', mockVariableReferenceResolverClientFactory);
  container.registerMock('DirectiveServiceClientFactory', mockDirectiveServiceClientFactory);
  container.registerMock('ResolutionServiceClientForDirectiveFactory', mockResolutionServiceClientForDirectiveFactory);
  container.registerMock('StateServiceClientFactory', mockStateServiceClientFactory);
  container.registerMock('StateTrackingServiceClientFactory', mockStateTrackingServiceClientFactory);
  container.registerMock('InterpreterServiceClientFactory', mockInterpreterServiceClientFactory);
} 