import { describe, it, expect } from 'vitest';
import { Environment } from './Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { VariableMetadataUtils } from '@core/types/variable/VariableMetadata';

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

  it('should not cause stack overflow when variable has mx getter attached', async () => {
    // Regression test for issue mlld-0rz: @debug caused stack overflow
    // when VariableMetadataUtils.attachContext had been called on the variable,
    // because buildVariableContext accessed variable.mx which triggered the getter
    // recursively.
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(
      fileSystem,
      pathService,
      '/test/project'
    );

    await env.registerBuiltinResolvers();

    // Get @debug once - this creates the variable
    const debugVar1 = env.getVariable('debug');
    expect(debugVar1).toBeDefined();

    // Attach context (this adds the mx getter that caused the recursion)
    VariableMetadataUtils.attachContext(debugVar1!);

    // Getting @debug again should NOT cause stack overflow
    // Before the fix, this would throw "Maximum call stack size exceeded"
    expect(() => {
      const debugVar2 = env.getVariable('debug');
      expect(debugVar2).toBeDefined();
      expect(debugVar2?.type).toBe('simple-text');
    }).not.toThrow();
  });

  it('should work when accessed through materializeGuardInputs path', async () => {
    // This tests the path that actually triggered the bug:
    // extractShowInputs -> getVariable -> materializeGuardInputs -> attachContext
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(
      fileSystem,
      pathService,
      '/test/project'
    );

    await env.registerBuiltinResolvers();

    // Import the guard inputs function that triggers attachContext
    const { materializeGuardInputs } = await import('../utils/guard-inputs');

    // Get @debug
    const debugVar = env.getVariable('debug');
    expect(debugVar).toBeDefined();

    // This is what extractShowInputs does - it passes the variable through
    // materializeGuardInputs which calls attachContext
    const materialized = materializeGuardInputs([debugVar!]);

    expect(materialized).toHaveLength(1);
    expect(materialized[0].name).toBe('debug');
    expect(materialized[0].type).toBe('simple-text');

    // Now access @debug again - this should not cause recursion
    const debugVar2 = env.getVariable('debug');
    expect(debugVar2).toBeDefined();
    expect(debugVar2?.value).toContain('### Environment variables:');
  });

  it('should handle multiple consecutive accesses without issues', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(
      fileSystem,
      pathService,
      '/test/project'
    );

    await env.registerBuiltinResolvers();

    // Access @debug multiple times rapidly
    const results: string[] = [];
    for (let i = 0; i < 5; i++) {
      const debugVar = env.getVariable('debug');
      expect(debugVar).toBeDefined();
      results.push(debugVar?.value as string);
    }

    // All results should be valid markdown
    for (const result of results) {
      expect(result).toContain('### Environment variables:');
      expect(result).toContain('### Global variables:');
      expect(result).toContain('### Statistics:');
    }
  });

  it('should include user variables when accessed after setting them', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(
      fileSystem,
      pathService,
      '/test/project'
    );

    await env.registerBuiltinResolvers();

    // Add multiple user variables
    const { createSimpleTextVariable } = await import('@core/types/variable');

    env.setVariable('myString', createSimpleTextVariable(
      'myString',
      'hello world',
      { directive: 'var', syntax: 'quoted', hasInterpolation: false, isMultiLine: false }
    ));

    env.setVariable('myNumber', createSimpleTextVariable(
      'myNumber',
      '42',
      { directive: 'var', syntax: 'quoted', hasInterpolation: false, isMultiLine: false }
    ));

    // Get @debug
    const debugVar = env.getVariable('debug');
    const output = debugVar?.value as string;

    // Should include user variables section
    expect(output).toContain('### User variables:');
    expect(output).toContain('@myString');
    expect(output).toContain('hello world');
    expect(output).toContain('@myNumber');
    expect(output).toContain('42');
  });
});