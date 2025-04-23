import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { container } from 'tsyringe';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory';
import { mockDeep } from 'vitest-mock-extended';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { TextNode } from '@core/syntax/types';
import { createLocation } from '@tests/utils/testFactories';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';

describe('Direct Container Resolution for OutputService', () => {
  let context: TestContextDI;
  let outputService: OutputService;
  let mockState: IStateService;
  let mockResolutionService: IResolutionService;

  beforeEach(async () => {
    // Initialize a test container
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Create mocks
    mockState = mockDeep<IStateService>();
    mockResolutionService = mockDeep<IResolutionService>();
    
    // Create the output service with mocks
    outputService = new OutputService(mockState, mockResolutionService);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should try to use direct container resolution for VariableReferenceResolverClientFactory', async () => {
    // Set up spy on container.resolve
    const resolveSpy = vi.spyOn(container, 'resolve');
    
    // Directly call the getVariableResolver method
    // This should trigger container.resolve
    outputService.getVariableResolver();
    
    // Verify container.resolve was called with the factory
    expect(resolveSpy).toHaveBeenCalledWith(VariableReferenceResolverClientFactory);
    
    // Clean up spy
    resolveSpy.mockRestore();
  });

  it('should gracefully handle circular dependency errors from container.resolve', async () => {
    // Set up spy on container.resolve to simulate a circular dependency error
    const resolveSpy = vi.spyOn(container, 'resolve');
    resolveSpy.mockImplementation((token) => {
      if (token === VariableReferenceResolverClientFactory) {
        throw new Error('Circular dependency detected (simulated)');
      }
      return mockDeep<any>();
    });
    
    // Create a text node that would trigger variable resolution
    const textNode: TextNode = {
      type: 'Text',
      content: 'Variable with nested property: {{data.nested.property}}',
      location: createLocation(1, 1)
    };
    
    // Set up mocks for state service 
    vi.mocked(mockState.isTransformationEnabled).mockReturnValue(true);
    vi.mocked(mockState.getTransformedNodes).mockReturnValue([textNode]);
    
    // Make resolution service work for basic text
    vi.mocked(mockResolutionService.resolveText).mockImplementation(async (text) => {
      return text.replace('{{data.nested.property}}', 'Resolved Value');
    });
    
    // This should not throw an error despite the circular dependency
    const output = await outputService.convert([textNode], mockState, 'markdown');
    
    // Check that output still contains the text (circular dependency handled gracefully)
    expect(output).toContain('Resolved Value');
    
    // Clean up spy
    resolveSpy.mockRestore();
  });
});