import { describe, it, expect } from 'vitest';
import { Environment } from './Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('@debug variable', () => {
  it('should produce markdown output with multiple sections', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(
      fileSystem,
      pathService,
      '/test/project'
    );
    
    // Initialize built-in resolvers
    await env.registerBuiltinResolvers();

    // Get the debug variable
    const debugVar = env.getVariable('debug');
    expect(debugVar).toBeDefined();
    expect(debugVar?.type).toBe('simple-text'); // debug returns markdown text
    
    // Check the output
    const debugOutput = debugVar?.value as string;
    expect(debugOutput).toBeDefined();
    expect(typeof debugOutput).toBe('string');
    
    // Verify it's markdown format (not JSON)
    expect(debugOutput).not.toMatch(/^\s*{/); // Doesn't start with {
    expect(debugOutput).toContain('##'); // Has markdown headers
    
    // Verify it has the expected sections
    expect(debugOutput).toContain('### Environment variables:');
    expect(debugOutput).toContain('### Global variables:');
    expect(debugOutput).toContain('### Statistics:');
    
    // Verify it has multiple lines of content
    const lines = debugOutput.split('\n').filter(line => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(5);
    
    // Verify it contains some expected content
    expect(debugOutput).toContain('@now');
    expect(debugOutput).toContain('@base');
    expect(debugOutput).toContain('Total variables:');
    expect(debugOutput).toContain('Output nodes:');
  });

  it('should work with lowercase @debug', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(
      fileSystem,
      pathService,
      '/test/project'
    );
    
    // Initialize built-in resolvers
    await env.registerBuiltinResolvers();

    // Get lowercase debug
    const debugVar = env.getVariable('debug');
    expect(debugVar).toBeDefined();
    expect(debugVar?.type).toBe('simple-text'); // debug returns markdown text
    
    // Should produce the same markdown output
    const debugOutput = debugVar?.value as string;
    expect(debugOutput).toContain('### Environment variables:');
    expect(debugOutput).toContain('### Global variables:');
  });

  it('should be lazy evaluated with current context', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(
      fileSystem,
      pathService,
      '/test/project'
    );
    
    // Initialize built-in resolvers
    await env.registerBuiltinResolvers();

    // Get debug once
    const debug1 = env.getVariable('debug');
    const output1 = debug1?.value as string;
    
    // Add a user variable
    const { createSimpleTextVariable } = await import('@core/types/variable');
    env.setVariable('testVar', createSimpleTextVariable(
      'testVar',
      'test value',
      { directive: 'var', syntax: 'quoted', hasInterpolation: false, isMultiLine: false },
      { definedAt: { line: 1, column: 1 } }
    ));
    
    // Get debug again - should include the new variable
    const debug2 = env.getVariable('debug');
    const output2 = debug2?.value as string;
    
    // Verify the second output includes our new variable
    expect(output2).toContain('### User variables:');
    expect(output2).toContain('@testVar');
    expect(output2).toContain('test value');
    
    // Verify it has more content than before
    expect(output2.length).toBeGreaterThan(output1.length);
  });

  it('should truncate long values', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(
      fileSystem,
      pathService,
      '/test/project'
    );
    
    // Initialize built-in resolvers
    await env.registerBuiltinResolvers();

    // Add a variable with a very long value
    const longValue = 'x'.repeat(100);
    const { createSimpleTextVariable: createText2 } = await import('@core/types/variable');
    env.setVariable('longVar', createText2('longVar', longValue, {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    }));
    
    // Get debug
    const debugVar = env.getVariable('debug');
    const debugOutput = debugVar?.value as string;
    
    // Verify the value is truncated
    expect(debugOutput).toContain('@longVar');
    expect(debugOutput).toContain('xxx'); // Contains some x's
    expect(debugOutput).toContain('(100 chars)'); // Shows total length
    expect(debugOutput).not.toContain(longValue); // But not the full value
  });
});