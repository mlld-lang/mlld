import { describe, it, expect } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { evaluate } from '@interpreter/core/interpreter';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { parse } from '@grammar/parser';
import { PathService } from '@services/fs/PathService';

describe('Complex Data Assignment', () => {
  it('should support embedded @run directives in data values', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/var @results = {
  echo: run {echo "hello world"},
  date: run {date}
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    const result = await evaluate(ast, env);
    
    // Get the results variable
    const resultsVar = env.getVariable('results');
    expect(resultsVar).toBeDefined();
    expect(resultsVar?.type).toBe('object');
    
    // The value should be evaluated lazily when accessed
    // For this test, we'll manually trigger evaluation
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const resolvedValue = await extractVariableValue(resultsVar!, env);
    
    expect(resolvedValue).toHaveProperty('echo');
    expect(resolvedValue.echo).toBe('hello world');
    expect(resolvedValue).toHaveProperty('date');
    expect(typeof resolvedValue.date).toBe('string');
  });

  it('should support embedded @show directives in data values', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/test.txt', 'File contents');
    const pathService = new PathService();
    const env = new Environment(fs, pathService, '/');
    
    const mlldContent = `
/var @docs = {
  readme: </test.txt>
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const docsVar = env.getVariable('docs');
    expect(docsVar).toBeDefined();
    
    // Manually trigger evaluation
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const resolvedValue = await extractVariableValue(docsVar!, env);
    
    expect(resolvedValue).toHaveProperty('readme');
    expect(resolvedValue.readme).toBe('File contents');
  });

  it('should support variable references with field access', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/var @user = {
  name: "John",
  scores: [10, 20, 30]
}

/var @results = {
  userName: @user.name,
  firstScore: @user.scores[0]
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const resultsVar = env.getVariable('results');
    expect(resultsVar).toBeDefined();
    
    // Manually trigger evaluation
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const resolvedValue = await extractVariableValue(resultsVar!, env);
    
    expect(resolvedValue.userName).toBe('John');
    expect(resolvedValue.firstScore).toBe(10);
  });

  it('should support template variables referenced in data values', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/var @name = "World"
/var @greeting = :::Hello {{name}}!:::
/var @farewell = :::Goodbye {{name}}!:::

/var @messages = {
  greeting: @greeting,
  farewell: @farewell
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const messagesVar = env.getVariable('messages');
    expect(messagesVar).toBeDefined();
    
    // Manually trigger evaluation
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const resolvedValue = await extractVariableValue(messagesVar!, env);
    
    // When templates are referenced in data objects, they are stored as arrays
    expect(Array.isArray(resolvedValue.greeting)).toBe(true);
    expect(Array.isArray(resolvedValue.farewell)).toBe(true);
    
    // Check the content structure
    expect(resolvedValue.greeting.length).toBe(3);
    expect(resolvedValue.greeting[0].content).toBe('Hello ');
    expect(resolvedValue.greeting[1].identifier).toBe('name');
    expect(resolvedValue.greeting[2].content).toBe('!');
    
    expect(resolvedValue.farewell.length).toBe(3);  
    expect(resolvedValue.farewell[0].content).toBe('Goodbye ');
    expect(resolvedValue.farewell[1].identifier).toBe('name');
    expect(resolvedValue.farewell[2].content).toBe('!');
  });

  it('should handle nested complex data structures', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/var @version = run {echo "1.0.0"}
/var @welcome = :::Welcome to MyApp!:::

/var @config = {
  app: {
    name: "MyApp",
    version: @version
  },
  messages: {
    welcome: @welcome
  }
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const configVar = env.getVariable('config');
    expect(configVar).toBeDefined();
    
    // Manually trigger evaluation
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const resolvedValue = await extractVariableValue(configVar!, env);
    
    expect(resolvedValue.app.name).toBe('MyApp');
    expect(resolvedValue.app.version).toBe('1.0.0');
    
    // Templates are resolved to strings when extracted
    expect(resolvedValue.messages.welcome).toBe('Welcome to MyApp!');
  });

  it('should handle arrays with embedded directives', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/var @testresults = [run {echo "test1"}, run {echo "test2"}, run {echo "test3"}]
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const testsVar = env.getVariable('testresults');
    expect(testsVar).toBeDefined();
    
    // Manually trigger evaluation
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const resolvedValue = await extractVariableValue(testsVar!, env);
    
    expect(Array.isArray(resolvedValue)).toBe(true);
    expect(resolvedValue).toEqual(['test1', 'test2', 'test3']);
  });

  it('should handle evaluation errors gracefully', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/var @results = {
  success: run {echo "ok"},
  failure: run {nonexistent-command},
  another: run {echo "still works"}
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const resultsVar = env.getVariable('results');
    expect(resultsVar).toBeDefined();
    
    // Manually trigger evaluation
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const resolvedValue = await extractVariableValue(resultsVar!, env);
    
    // Should have partial results
    expect(resolvedValue.success).toBe('ok');
    // With error-behavior: continue, the command returns output even on failure
    expect(typeof resolvedValue.failure).toBe('string');
    expect(resolvedValue.failure).toContain('nonexistent-command');
    expect(resolvedValue.another).toBe('still works');
  });
});