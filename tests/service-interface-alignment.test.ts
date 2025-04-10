import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { container, injectable } from 'tsyringe';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';
import { ResolutionServiceClientForDirectiveFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientForDirectiveFactory.js';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient.js';
import type { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { mockDeep } from 'vitest-mock-extended';
import { Service } from '@core/ServiceProvider.js';
import type { VariableReferenceNode } from '@core/ast/ast/astTypes';
import { VariableType } from '@core/types';

/**
 * Mock implementation of the ResolutionService for testing
 */
@injectable()
@Service({
  description: 'Mock ResolutionService for testing'
})
class MockResolutionService implements IResolutionService {
  async resolveText(text: string, context: ResolutionContext): Promise<string> {
    return `Resolved text: ${text}`;
  }

  async resolveData(node: VariableReferenceNode, context: ResolutionContext): Promise<any> {
    const fieldsString = node.fields?.map(f => f.value).join('.') || '';
    const refString = node.identifier + (fieldsString ? '.' + fieldsString : '');
    return { data: `Resolved data: ${refString}` };
  }

  async resolvePath(path: string, context: ResolutionContext): Promise<string> {
    return `/resolved/path/${path}`;
  }

  async resolveFile(path: string): Promise<string> {
    return `File content for ${path}`;
  }

  async resolveContent(nodes: any[], context: ResolutionContext): Promise<string> {
    return `Resolved content from ${nodes.length} nodes`;
  }

  async resolveInContext(value: string | any, context: ResolutionContext): Promise<string> {
    return `Resolved in context: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
  }

  async validateResolution(value: string | any, context: ResolutionContext): Promise<void> {
    // Mock implementation does nothing
  }

  async extractSection(content: string, section: string, fuzzy?: number): Promise<string> {
    return `Extracted section '${section}' with fuzzy=${fuzzy || 0.7}`;
  }

  async detectCircularReferences(value: string): Promise<void> {
    // Mock implementation does nothing
  }

  enableResolutionTracking(config: any): void {
    // Mock implementation does nothing
  }

  getResolutionTracker(): any {
    return null;
  }
}

describe('Service Interface Alignment for Resolution Service', () => {
  let context: TestContextDI;
  let mockState: IStateService;
  let mockResolutionService: IResolutionService;
  let resolutionClientFactory: ResolutionServiceClientFactory;
  let directiveClientFactory: ResolutionServiceClientForDirectiveFactory;

  beforeEach(async () => {
    // Initialize a test container
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Create mocks
    mockState = mockDeep<IStateService>();
    mockResolutionService = new MockResolutionService();
    
    // Register the mock resolution service
    context.registerMock('IResolutionService', mockResolutionService);
    
    // Create the client factories
    resolutionClientFactory = new ResolutionServiceClientFactory(mockResolutionService);
    directiveClientFactory = new ResolutionServiceClientForDirectiveFactory(mockResolutionService);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('ResolutionServiceClient', () => {
    let client: IResolutionServiceClient;

    beforeEach(() => {
      client = resolutionClientFactory.createClient();
    });

    it('should have properly typed methods', () => {
      // This test is mainly for type-checking during compilation
      expect(client).toHaveProperty('resolveVariables');
      expect(client).toHaveProperty('resolveVariableReference');
      expect(client).toHaveProperty('extractSection');
      expect(client).toHaveProperty('resolveText');
      expect(client).toHaveProperty('resolveInContext');
    });

    it('should properly call through to the resolution service', async () => {
      // Set up spy on the mock resolution service
      const spy = vi.spyOn(mockResolutionService, 'resolveInContext');
      
      // Create a basic resolution context
      const context: ResolutionContext = {
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: true
        },
        state: mockState
      };
      
      // Call the client method
      await client.resolveVariables('{{variable}}', context);
      
      // Verify the spy was called with the correct parameters
      expect(spy).toHaveBeenCalledWith('{{variable}}', context);
    });

    it('should handle extraction with fuzzy threshold', async () => {
      // Set up spy on the mock resolution service
      const spy = vi.spyOn(mockResolutionService, 'extractSection');
      
      // Call the client method with a fuzzy threshold
      await client.extractSection('content', 'heading', 0.8);
      
      // Verify the spy was called with the correct parameters
      expect(spy).toHaveBeenCalledWith('content', 'heading', 0.8);
    });
  });

  describe('ResolutionServiceClientForDirective', () => {
    let client: IResolutionServiceClientForDirective;

    beforeEach(() => {
      client = directiveClientFactory.createClient();
    });

    it('should have properly typed methods', () => {
      // This test is mainly for type-checking during compilation
      expect(client).toHaveProperty('resolveText');
      expect(client).toHaveProperty('resolveData');
      expect(client).toHaveProperty('resolvePath');
      expect(client).toHaveProperty('resolveContent');
      expect(client).toHaveProperty('resolveInContext');
    });

    it('should properly call through to the resolution service', async () => {
      // Set up spies on the mock resolution service
      const textSpy = vi.spyOn(mockResolutionService, 'resolveText');
      const dataSpy = vi.spyOn(mockResolutionService, 'resolveData');
      const pathSpy = vi.spyOn(mockResolutionService, 'resolvePath');
      
      // Create a basic resolution context
      const context: ResolutionContext = {
        state: mockState,
        strict: false,
        depth: 0,
        flags: {
          isVariableEmbed: false,
          isTransformation: false,
          allowRawContentResolution: false,
          isDirectiveHandler: false,
          isImportContext: false,
          processNestedVariables: true
        },
      } as ResolutionContext;
      
      // Create a mock VariableReferenceNode for data.field
      const mockDataNode: VariableReferenceNode = {
        type: 'VariableReference',
        identifier: 'data',
        valueType: VariableType.DATA,
        fields: [{ type: 'field', value: 'field' }],
        isVariableReference: true,
      } as VariableReferenceNode;
      
      // Call the client methods, using the node for resolveData
      await client.resolveText('{{variable}}', context);
      await client.resolveData(mockDataNode, context);
      await client.resolvePath('/path/to/file', context);
      
      // Verify the spies were called with the correct parameters
      expect(textSpy).toHaveBeenCalledWith('{{variable}}', context);
      expect(dataSpy).toHaveBeenCalledWith(mockDataNode, context);
      expect(pathSpy).toHaveBeenCalledWith('/path/to/file', context);
    });
  });
});