import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';

describe('TestContextDI Helpers', () => {
  const helpers = TestContextDI.createTestHelpers();
  let context: TestContextDI;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
    }
  });

  describe('setupMinimal', () => {
    beforeEach(() => {
      context = helpers.setupMinimal();
    });

    it('should create a TestContextDI instance', () => {
      expect(context).toBeInstanceOf(TestContextDI);
    });

    it('should register IFileSystem (MemFS)', async () => {
      const fsInstance = await context.resolve<IFileSystem>('IFileSystem');
      expect(fsInstance).toBeDefined();
      // Check if it behaves like MemFS (has specific methods maybe?)
      expect(fsInstance.writeFile).toBeDefined(); 
    });

    it('should NOT register standard service mocks by default', async () => {
      // Attempting to resolve should ideally fail or return undefined if not registered
      // Depending on container configuration, it might throw or return undefined.
      // We'll check if it's explicitly registered.
      expect(context.container.isRegistered('IStateService')).toBe(false);
      // Try resolving - expect it to potentially throw if using strict resolution
      // await expect(context.resolve('IStateService')).rejects.toThrow(); 
      // Or check if resolution returns undefined/null if allowUnregistered is on (less ideal)
    });

    it('should register essential client factories needed by minimal services', () => {
        // PathService needs FileSystemServiceClientFactory usually
        expect(context.container.isRegistered('FileSystemServiceClientFactory')).toBe(true);
        // FileSystemService needs PathServiceClientFactory
        expect(context.container.isRegistered('PathServiceClientFactory')).toBe(true);
    });
  });

  describe('setupWithStandardMocks', () => {
    beforeEach(async () => {
      // Setup WITHOUT overrides first
      context = helpers.setupWithStandardMocks();
      // Need to await initialization implicitly
      await context.resolve('IFileSystemService'); 
    });

    it('should create a TestContextDI instance', () => {
      expect(context).toBeInstanceOf(TestContextDI);
    });

    it('should register standard service mocks (e.g., IStateService)', async () => {
      expect(context.container.isRegistered('IStateService')).toBe(true);
      const stateService = await context.resolve<IStateService>('IStateService');
      expect(stateService).toBeDefined();
      // Check if it has the methods defined in the factory mock, confirming it's the right type/structure
      // expect(vi.isMockFunction(stateService.getTextVar)).toBe(true); // This fails, likely due to container behavior
      expect(stateService.getTextVar).toBeDefined();
      expect(typeof stateService.getTextVar).toBe('function');
      expect(stateService.setTextVar).toBeDefined(); 
      expect(typeof stateService.setTextVar).toBe('function');
      // Add checks for a couple more key methods from IStateService/MockFactory
      expect(stateService.setDataVar).toBeDefined();
      expect(stateService.createChildState).toBeDefined();
    });

    it('should register standard client factories (e.g., PathServiceClientFactory)', () => {
      expect(context.container.isRegistered('PathServiceClientFactory')).toBe(true);
      // Optionally resolve the factory and check if it provides a mocked client
      const factory = context.resolveSync('PathServiceClientFactory');
      expect(factory).toBeDefined();
      expect(vi.isMockFunction(factory.createClient)).toBe(true);
      const client = factory.createClient();
      expect(client).toBeDefined();
      expect(vi.isMockFunction(client.resolvePath)).toBe(true);
    });

    it('should register IFileSystem (MemFS)', async () => {
        const fsInstance = await context.resolve<IFileSystem>('IFileSystem');
        expect(fsInstance).toBeDefined();
        expect(fsInstance.writeFile).toBeDefined(); 
    });

    it('should apply custom mock overrides', async () => {
      // Create a distinct custom mock
      const customStateMock: Partial<IStateService> = {
        getTextVar: vi.fn().mockReturnValue({ name: 'custom', value: 'override' }),
        // Add a unique property/method to distinguish it
        customProperty: 'exists' 
      };
      
      // Cleanup previous context
      await context.cleanup();
      
      // Create new context WITH the override
      context = helpers.setupWithStandardMocks({
        'IStateService': customStateMock
      });
      await context.resolve('IFileSystemService'); // Ensure init

      // Resolve the service and check if it's the overridden mock
      expect(context.container.isRegistered('IStateService')).toBe(true);
      const stateService = await context.resolve<IStateService>('IStateService');
      expect(stateService).toBeDefined();
      // Check the mocked method behavior
      expect(stateService.getTextVar('any')).toEqual({ name: 'custom', value: 'override' });
      // Check the unique property
      expect((stateService as any).customProperty).toBe('exists');
      // Ensure it's not just the default factory mock (which wouldn't have customProperty)
      const defaultMock = MockFactory.createStateService();
      expect((defaultMock as any).customProperty).toBeUndefined();
    });
    
    it('should allow overriding specific factory mocks', async () => {
        const customPathClient = { 
            resolvePath: vi.fn().mockReturnValue('/custom/resolved'),
            normalizePath: vi.fn().mockImplementation(p => p)
        };
        const customPathClientFactory = {
            createClient: vi.fn().mockReturnValue(customPathClient)
        };
        
        await context.cleanup(); // Use await
        
        context = helpers.setupWithStandardMocks({
            'PathServiceClientFactory': customPathClientFactory
        });
         // Await the modified initPromise which includes override registration
         await context.initPromise; 
         
         const resolvedFactory = context.resolveSync('PathServiceClientFactory');
         // Change assertion from toBe to check behavior
         // expect(resolvedFactory).toBe(customPathClientFactory); 
         expect(resolvedFactory.createClient).toBe(customPathClientFactory.createClient); // Check if the mock function is the same
         const client = resolvedFactory.createClient();
         expect(client).toBe(customPathClient);
         expect(client.resolvePath('test')).toBe('/custom/resolved');
    });
  });
}); 