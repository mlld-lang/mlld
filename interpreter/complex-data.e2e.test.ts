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
/data @results = {
  echo: @run {echo "hello world"},
  date: @run {date}
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    const result = await evaluate(ast, env);
    
    // Get the results variable
    const resultsVar = env.getVariable('results');
    expect(resultsVar).toBeDefined();
    expect(resultsVar?.type).toBe('data');
    
    // The value should be evaluated lazily when accessed
    // For this test, we'll manually trigger evaluation
    const { resolveVariableValue } = await import('@interpreter/core/interpreter');
    const resolvedValue = await resolveVariableValue(resultsVar!, env);
    
    expect(resolvedValue).toHaveProperty('echo');
    expect(resolvedValue.echo).toBe('hello world');
    expect(resolvedValue).toHaveProperty('date');
    expect(typeof resolvedValue.date).toBe('string');
  });

  it('should support embedded @add directives in data values', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/test.txt', 'File contents');
    const pathService = new PathService();
    const env = new Environment(fs, pathService, '/');
    
    const mlldContent = `
/data @docs = {
  readme: @add [/test.txt]
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const docsVar = env.getVariable('docs');
    expect(docsVar).toBeDefined();
    
    // Manually trigger evaluation
    const { resolveVariableValue } = await import('@interpreter/core/interpreter');
    const resolvedValue = await resolveVariableValue(docsVar!, env);
    
    expect(resolvedValue).toHaveProperty('readme');
    expect(resolvedValue.readme).toBe('File contents');
  });

  it('should support variable references with field access', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/data @user = {
  name: "John",
  scores: [10, 20, 30]
}

/data @results = {
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
    const { resolveVariableValue } = await import('@interpreter/core/interpreter');
    const resolvedValue = await resolveVariableValue(resultsVar!, env);
    
    expect(resolvedValue.userName).toBe('John');
    expect(resolvedValue.firstScore).toBe(10);
  });

  it('should support inline templates in data values', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/text @name = "World"

/data @messages = {
  greeting: [[Hello {{name}}!]],
  farewell: [[Goodbye {{name}}!]]
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const messagesVar = env.getVariable('messages');
    expect(messagesVar).toBeDefined();
    
    // Manually trigger evaluation
    const { resolveVariableValue } = await import('@interpreter/core/interpreter');
    const resolvedValue = await resolveVariableValue(messagesVar!, env);
    
    expect(resolvedValue.greeting).toBe('Hello World!');
    expect(resolvedValue.farewell).toBe('Goodbye World!');
  });

  it('should handle nested complex data structures', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/data @config = {
  app: {
    name: "MyApp",
    version: @run {echo "1.0.0"}
  },
  messages: {
    welcome: [[Welcome to MyApp!]]
  }
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const configVar = env.getVariable('config');
    expect(configVar).toBeDefined();
    
    // Manually trigger evaluation
    const { resolveVariableValue } = await import('@interpreter/core/interpreter');
    const resolvedValue = await resolveVariableValue(configVar!, env);
    
    expect(resolvedValue.app.name).toBe('MyApp');
    expect(resolvedValue.app.version).toBe('1.0.0');
    expect(resolvedValue.messages.welcome).toBe('Welcome to MyApp!');
  });

  it('should handle arrays with embedded directives', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/data @tests = [@run {echo "test1"}, @run {echo "test2"}, @run {echo "test3"}]
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const testsVar = env.getVariable('tests');
    expect(testsVar).toBeDefined();
    
    // Manually trigger evaluation
    const { resolveVariableValue } = await import('@interpreter/core/interpreter');
    const resolvedValue = await resolveVariableValue(testsVar!, env);
    
    expect(Array.isArray(resolvedValue)).toBe(true);
    expect(resolvedValue).toEqual(['test1', 'test2', 'test3']);
  });

  it('should handle evaluation errors gracefully', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());
    
    const mlldContent = `
/data @results = {
  success: @run {echo "ok"},
  failure: @run {nonexistent-command},
  another: @run {echo "still works"}
}
`;
    
    const parseResult = await parse(mlldContent);
    const ast = parseResult.ast;
    await evaluate(ast, env);
    
    const resultsVar = env.getVariable('results');
    expect(resultsVar).toBeDefined();
    
    // Manually trigger evaluation
    const { resolveVariableValue } = await import('@interpreter/core/interpreter');
    const resolvedValue = await resolveVariableValue(resultsVar!, env);
    
    // Should have partial results
    expect(resolvedValue.success).toBe('ok');
    // With error-behavior: continue, the command returns output even on failure
    expect(typeof resolvedValue.failure).toBe('string');
    expect(resolvedValue.failure).toContain('nonexistent-command');
    expect(resolvedValue.another).toBe('still works');
  });
});