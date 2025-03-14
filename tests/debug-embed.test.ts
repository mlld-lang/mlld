import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from '@api/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { Services } from '@core/types/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { MeldNode, DirectiveNode, TextNode } from '@core/syntax/types';
import { EmbedDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { isVariableReferenceNode } from '@core/syntax/types/variables.js';

describe('Phase 4B: Variable-based Embed Transformation Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should implement a simplified Phase 4B fix for variable embeds in transformations', async () => {
    console.log('----- TESTING PHASE 4B IMPLEMENTATION -----');
    
    // Create test file with variable and embed directive
    const testContent = '@data role = { "architect": "Senior architect" }\n@embed {{role.architect}}';
    await context.services.filesystem.writeFile('test.meld', testContent);
    
    console.log('Test file content:', testContent);
    
    // This will store our captured result for testing
    let resolvedVariableContent = '';
    
    // Monitor variable resolution in the VariableReferenceResolver
    const variableResolveTracker = vi.fn((varName, value) => {
      console.log(`Variable resolved: ${varName} = ${value}`);
      if (varName === 'role.architect') {
        resolvedVariableContent = value;
      }
    });
    
    // Create a resolution interceptor
    const originalResolveFieldAccess = context.container.resolve('IResolutionService').resolveFieldAccess;
    if (originalResolveFieldAccess) {
      context.container.resolve('IResolutionService').resolveFieldAccess = async function(varName, fieldPath, context) {
        const result = await originalResolveFieldAccess.call(this, varName, fieldPath, context);
        variableResolveTracker(`${varName}.${fieldPath}`, result);
        return result;
      };
    }
    
    // Run the test with transformation enabled
    console.log('Running main() with transformation enabled...');
    
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });
    
    console.log('----- TEST RESULTS -----');
    console.log('Output content:', result);
    console.log('Resolved variable content:', resolvedVariableContent);
    
    // Test expectations with deterministic assertions
    expect(result).not.toContain('@embed');
    expect(result).toContain('Senior architect');
    
    // Verify that our variable resolution was captured
    expect(variableResolveTracker).toHaveBeenCalled();
    
    // Validate the transformation happened correctly
    // Either the variable was properly resolved or the transformation pipeline worked
    const stateRoleData = context.services.state.getDataVar('role');
    expect(stateRoleData).toEqual({ architect: 'Senior architect' });
    
    // We expect that the transformation has been properly applied 
    // and that either our interceptor caught the variable resolution
    // or the final output contains the expected content
    if (resolvedVariableContent) {
      expect(resolvedVariableContent).toBe('Senior architect');
    }
  });
});