import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { Services, ProcessOptions } from '@core/types/index.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';

describe('Array Access Tests', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
    context.enableTransformation();
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.resetModules();
  });

  it('should handle direct array access with dot notation', async () => {
    const content = 
`@data items = ["apple", "banana", "cherry"]

First item: {{items.0}}
Second item: {{items.1}}
Third item: {{items.2}}`;
    
    // Resolve services from the test container
    const parserService = context.resolveSync<IParserService>('IParserService');
    const interpreterService = context.resolveSync<IInterpreterService>('IInterpreterService');
    const stateService = context.resolveSync<IStateService>('IStateService');
    const outputService = context.resolveSync<IOutputService>('IOutputService');

    // Add checks to ensure services are resolved
    if (!parserService || !interpreterService || !stateService || !outputService) {
      throw new Error('Failed to resolve necessary services for test');
    }

    // Set transformation on the resolved state service
    stateService.setTransformationEnabled(true); // Ensure transformation is enabled

    // Parse the content directly
    const ast = await parserService.parse(content);

    // Interpret the AST using the resolved services
    const resultState = await interpreterService.interpret(ast, {
      strict: true,
      initialState: stateService,
      // filePath is not strictly needed here as we parse content directly
    });

    // Convert the result using the resolved services
    const nodesToProcess = resultState.getTransformedNodes();
    const result = await outputService.convert(nodesToProcess, resultState, 'markdown', {});

    // Log the content for debugging
    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('First item: apple\nSecond item: banana\nThird item: cherry');
  });
}); 