import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import * as path from 'path';

/**
 * Test helper for testing mlld with immediate effects.
 * Captures all effects in a TestEffectHandler for verification.
 */
export async function testWithEffects(
  input: string,
  options: {
    basePath?: string;
    variables?: Record<string, any>;
    [key: string]: any;
  } = {}
): Promise<{ 
  output: string; 
  errors: string; 
  handler: TestEffectHandler;
  result: string; // The final formatted result
}> {
  // Enable immediate effects for testing
  process.env.MLLD_IMMEDIATE_EFFECTS = 'true';
  
  const handler = new TestEffectHandler();
  
  // Create file system and path services
  const fileSystem = new NodeFileSystem();
  const pathService = new PathService();
  const basePath = options.basePath || process.cwd();
  
  // Parse the input
  const parseResult = await parse(input);
  if (!parseResult.success) {
    throw parseResult.error || new Error('Parse failed');
  }
  
  // Create environment with test handler
  const env = new Environment(
    fileSystem,
    pathService,
    basePath,
    undefined, // no parent
    handler // Use test effect handler
  );
  
  // Register built-in resolvers
  await env.registerBuiltinResolvers();
  
  // Set any initial variables
  if (options.variables) {
    for (const [name, value] of Object.entries(options.variables)) {
      env.setVariable(name, { 
        type: 'text', 
        name, 
        value: String(value),
        definedAt: null
      });
    }
  }
  
  // Evaluate the AST
  const ast = parseResult.ast;
  await evaluate(ast, env);
  
  // Get the final result (nodes as text)
  const nodes = env.getNodes();
  const result = nodes.map((node: any) => {
    if (node.nodeType === 'text' || node.type === 'Text') {
      return node.content || '';
    }
    return '';
  }).join('');
  
  // Clean up: restore original env var state
  delete process.env.MLLD_IMMEDIATE_EFFECTS;
  
  return {
    output: handler.getOutput(),
    errors: handler.getErrors(),
    handler,
    result
  };
}

/**
 * Helper to test that effects appear in order
 */
export function expectEffectsInOrder(
  handler: TestEffectHandler,
  expectedOutputs: string[]
): void {
  const outputs = handler.collected
    .filter(e => e.type === 'both' || e.type === 'stdout')
    .map(e => e.content);
  
  expect(outputs).toEqual(expectedOutputs);
}

/**
 * Helper to test for loop with immediate effects
 */
export async function testForLoopEffects(
  mlldCode: string
): Promise<string[]> {
  const { handler } = await testWithEffects(mlldCode);
  return handler.collected
    .filter(e => e.type === 'both' || e.type === 'stdout')
    .map(e => e.content);
}