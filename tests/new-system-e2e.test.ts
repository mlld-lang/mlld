import { describe, it, expect, beforeAll } from 'vitest';
import { container } from '@core/di-config.new';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import { VariableType } from '@core/types';

describe('New System End-to-End Test', () => {
  let parser: IParserService;
  let interpreter: IInterpreterService;
  
  beforeAll(() => {
    // Get services from container
    parser = container.resolve<IParserService>('IParserService');
    interpreter = container.resolve<IInterpreterService>('IInterpreterService');
  });
  
  it('should parse and interpret text directives', async () => {
    const meldContent = `@text greeting = "Hello, World!"`;
    
    // Parse the content
    const nodes = await parser.parse(meldContent, 'test.meld');
    const directiveNodes = nodes.filter(n => n.type === 'Directive');
    expect(directiveNodes).toHaveLength(1);
    
    // Interpret the AST
    const finalState = await interpreter.interpret(nodes, {
      strict: true,
      filePath: 'test.meld'
    });
    
    // Check that the variable was created
    const greeting = finalState.getVariable('greeting');
    expect(greeting).toBeDefined();
    expect(greeting?.type).toBe(VariableType.TEXT);
    expect(greeting?.value).toBe('Hello, World!');
  });
  
  it('should handle variable references', async () => {
    const meldContent = `
@text name = "Alice"
@text message = "Hello, {{name}}!"
    `.trim();
    
    // Parse the content
    const nodes = await parser.parse(meldContent, 'test.meld');
    
    // Interpret the AST
    const finalState = await interpreter.interpret(nodes, {
      strict: true,
      filePath: 'test.meld'
    });
    
    // Check that variables were created and interpolated
    const name = finalState.getVariable('name');
    expect(name?.value).toBe('Alice');
    
    const message = finalState.getVariable('message');
    expect(message?.value).toBe('Hello, Alice!');
  });
  
  it('should handle data directives', async () => {
    const meldContent = `@data config = {"debug": true, "port": 3000}`;
    
    // Parse the content
    const nodes = await parser.parse(meldContent, 'test.meld');
    
    // Interpret the AST
    const finalState = await interpreter.interpret(nodes, {
      strict: true,
      filePath: 'test.meld'
    });
    
    // Check that the data variable was created
    const config = finalState.getVariable('config');
    expect(config).toBeDefined();
    expect(config?.type).toBe(VariableType.DATA);
    expect(config?.value).toEqual({ debug: true, port: 3000 });
  });
  
  it('should handle multiple directives in sequence', async () => {
    const meldContent = `
@text var1 = "First"
@text var2 = "Second"
@data var3 = [1, 2, 3]
    `.trim();
    
    // Parse the content
    const nodes = await parser.parse(meldContent, 'test.meld');
    
    // Interpret the AST
    const finalState = await interpreter.interpret(nodes, {
      strict: true,
      filePath: 'test.meld'
    });
    
    // Check all variables
    expect(finalState.getVariable('var1')?.value).toBe('First');
    expect(finalState.getVariable('var2')?.value).toBe('Second');
    expect(finalState.getVariable('var3')?.value).toEqual([1, 2, 3]);
  });
  
  it('should use minimal StateService without adapter methods', async () => {
    const meldContent = `@text test = "minimal"`;
    
    const nodes = await parser.parse(meldContent, 'test.meld');
    const finalState = await interpreter.interpret(nodes, {
      strict: true,
      filePath: 'test.meld'
    });
    
    // These methods should exist on minimal interface
    expect(typeof finalState.getVariable).toBe('function');
    expect(typeof finalState.setVariable).toBe('function');
    expect(typeof finalState.getAllVariables).toBe('function');
    expect(typeof finalState.addNode).toBe('function');
    expect(typeof finalState.getNodes).toBe('function');
    expect(typeof finalState.createChild).toBe('function');
    
    // These methods should NOT exist on minimal interface
    // (they only exist if using the adapter)
    expect((finalState as any).createChildState).toBeUndefined();
    expect((finalState as any).setTextVar).toBeUndefined();
    expect((finalState as any).setDataVar).toBeUndefined();
    expect((finalState as any).getStateId).toBeUndefined();
  });
});