import { describe, it, expect, beforeAll } from 'vitest';
import { container } from '@core/di-config.new';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.new';
import { HandlerRegistry } from '@services/pipeline/DirectiveService/HandlerRegistry.new';
import { VariableType } from '@core/types';

describe('New System Integration Test', () => {
  let parser: IParserService;
  let interpreter: IInterpreterService;
  let directiveService: IDirectiveService;
  
  beforeAll(() => {
    // Get services from container
    parser = container.resolve<IParserService>('IParserService');
    interpreter = container.resolve<IInterpreterService>('IInterpreterService');
    directiveService = container.resolve<IDirectiveService>('IDirectiveService');
    
    // Register handlers with the directive service
    HandlerRegistry.registerWithService(directiveService, container);
  });
  
  it('should parse and interpret a simple meld file', async () => {
    const meldContent = `
@text greeting = "Hello, World!"
@data person = {"name": "Alice", "age": 30}
@path testFile = "./test.txt"
    `.trim();
    
    // Parse the content
    const nodes = await parser.parse(meldContent, 'test.meld');
    expect(nodes).toBeDefined();
    
    // Filter to just directive nodes
    const directiveNodes = nodes.filter(n => n.type === 'Directive');
    expect(directiveNodes).toHaveLength(3);
    
    // Interpret the AST
    const finalState = await interpreter.interpret(nodes, {
      strict: true,
      filePath: 'test.meld'
    });
    
    // Check that all variables were created
    const greeting = finalState.getVariable('greeting');
    expect(greeting).toBeDefined();
    expect(greeting?.type).toBe(VariableType.TEXT);
    expect(greeting?.value).toBe('Hello, World!');
    
    const person = finalState.getVariable('person');
    expect(person).toBeDefined();
    expect(person?.type).toBe(VariableType.DATA);
    expect(person?.value).toEqual({ name: 'Alice', age: 30 });
    
    const testFile = finalState.getVariable('testFile');
    expect(testFile).toBeDefined();
    expect(testFile?.type).toBe(VariableType.PATH);
    expect(testFile?.value.originalValue).toBe('./test.txt');
  });
  
  it('should handle variable references and add directives', async () => {
    const meldContent = `
@text content = "This is some content"
@add @content
    `.trim();
    
    // Parse the content
    const nodes = await parser.parse(meldContent, 'test.meld');
    expect(nodes).toBeDefined();
    
    // Filter to just directive nodes
    const directiveNodes = nodes.filter(n => n.type === 'Directive');
    expect(directiveNodes).toHaveLength(2);
    
    // Interpret the AST
    const finalState = await interpreter.interpret(nodes, {
      strict: true,
      filePath: 'test.meld'
    });
    
    // Check that the variable was created
    const content = finalState.getVariable('content');
    expect(content).toBeDefined();
    expect(content?.value).toBe('This is some content');
    
    // Check that the add directive created a replacement
    const transformedNodes = finalState.getTransformedNodes();
    // We expect at least one text node with the content
    const textNodes = transformedNodes.filter(n => n.type === 'Text');
    expect(textNodes.length).toBeGreaterThan(0);
  });
  
  it('should handle exec and run directives', async () => {
    const meldContent = `
@exec myCommand = echo "Hello from command"
@run @myCommand
    `.trim();
    
    // Parse the content
    const nodes = await parser.parse(meldContent, 'test.meld');
    expect(nodes).toBeDefined();
    
    // Filter to just directive nodes
    const directiveNodes = nodes.filter(n => n.type === 'Directive');
    expect(directiveNodes).toHaveLength(2);
    
    // Note: We won't actually run the command in tests, but we can verify parsing
    expect(directiveNodes[0].kind).toBe('exec');
    expect(directiveNodes[1].kind).toBe('run');
  });
});