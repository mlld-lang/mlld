/// <reference types="vitest" />
import { describe, expect, it } from 'vitest';
import { parse } from '@core/ast';
import { VariableReferenceNode } from '@core/syntax/types';

describe('Unified variable syntax', () => {
  it('should parse text variables with {{variable}} syntax', async () => {
    const input = 'Hello {{name}}!';
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(3);
    
    // Text node "Hello "
    expect(result.ast[0].type).toBe('Text');
    expect(result.ast[0].content).toBe('Hello ');
    
    // Variable node
    expect(result.ast[1].type).toBe('VariableReference');
    expect(result.ast[1].identifier).toBe('name');
    expect(result.ast[1].valueType).toBe('text');
    expect(result.ast[1].isVariableReference).toBe(true);
    
    // Text node "!"
    expect(result.ast[2].type).toBe('Text');
    expect(result.ast[2].content).toBe('!');
  });
  
  it('should parse data variables with {{variable}} syntax', async () => {
    const input = 'Hello {{user.name}}';
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(2);
    expect(result.ast[1].type).toBe('VariableReference');
    expect(result.ast[1].identifier).toBe('user');
    expect(result.ast[1].fields).toEqual([{ type: 'field', value: 'name' }]);
    expect(result.ast[1].valueType).toBe('data');
    expect(result.ast[1].isVariableReference).toBe(true);
  });
  
  it('should distinguish between text and data variables using fields', async () => {
    const input = 'Text {{text}} and data {{data.field}}';
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(4);
    
    const textVar = result.ast.find(node => node.type === 'VariableReference' && node.valueType === 'text');
    expect(textVar).toBeDefined();
    expect(textVar?.valueType).toBe('text');
    expect(textVar?.isVariableReference).toBe(true);
    
    const dataVar = result.ast.find(node => node.type === 'VariableReference' && node.valueType === 'data');
    expect(dataVar).toBeDefined();
    expect(dataVar?.valueType).toBe('data');
    expect(dataVar?.fields).toEqual([{ type: 'field', value: 'field' }]);
    expect(dataVar?.isVariableReference).toBe(true);
  });
  
  it('should parse multiline templates with new variable syntax', async () => {
    const input = '@text template = [[\nHello {{name}}!\nWelcome to {{site.title}}.\n]]';
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(1);
    expect(result.ast[0].type).toBe('Directive');
    expect(result.ast[0].directive.kind).toBe('text');
    expect(result.ast[0].directive.identifier).toBe('template');
    expect(result.ast[0].directive.value).toBe('\nHello {{name}}!\nWelcome to {{site.title}}.\n');
  });
  
  it('should preserve path variables with $variable syntax', async () => {
    const input = '@embed [$PROJECTPATH/file.md]';
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(1);
    expect(result.ast[0].type).toBe('Directive');
    expect(result.ast[0].directive.kind).toBe('embed');
    expect(result.ast[0].directive.path.raw).toBe('$PROJECTPATH/file.md');
  });
});

describe('Variable Syntax Handling', () => {
  // Test data
  const filePath = 'test-file.md';
  const importPath = './components/Button.jsx';
  const command = 'npm test';

  describe('@embed directive', () => {
    it('should handle bracketed variable syntax', async () => {
      const input = '@text file_path = "test-file.md"\n\n@embed [{{file_path}}]';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, embed directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with embed directive
      const embedNode = result.ast.find(node => node.directive?.kind === 'embed');
      expect(embedNode).toBeDefined();
      expect(embedNode.directive.kind).toBe('embed');
      
      // Check the path contains the variable
      expect(embedNode.directive.path.raw).toBe('{{file_path}}');
      
      // Check that variables array contains 'file_path'
      expect(embedNode.directive.path.structured.variables.text).toContain('file_path');
    });

    it('should handle non-bracketed variable syntax', async () => {
      const input = '@text file_path = "test-file.md"\n\n@embed {{file_path}}';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, embed directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with embed directive
      const embedNode = result.ast.find(node => node.directive?.kind === 'embed');
      expect(embedNode).toBeDefined();
      expect(embedNode.directive.kind).toBe('embed');
      
      // Check the path contains the variable
      expect(embedNode.directive.path.raw).toBe('{{file_path}}');
      
      // Check that variables array contains 'file_path'
      expect(embedNode.directive.path.structured.variables.text).toContain('file_path');
    });
  });

  describe('@import directive', () => {
    it('should handle bracketed variable syntax', async () => {
      const input = '@text import_path = "./components/Button.jsx"\n\n@import [{{import_path}}]';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, import directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with import directive
      const importNode = result.ast.find(node => node.directive?.kind === 'import');
      expect(importNode).toBeDefined();
      expect(importNode.directive.kind).toBe('import');
      
      // Check the path contains the variable
      expect(importNode.directive.path.raw).toBe('{{import_path}}');
      
      // Check that variables array contains 'import_path'
      expect(importNode.directive.path.structured.variables.text).toContain('import_path');
    });

    it('should handle non-bracketed variable syntax', async () => {
      const input = '@text import_path = "./components/Button.jsx"\n\n@import {{import_path}}';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, import directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with import directive
      const importNode = result.ast.find(node => node.directive?.kind === 'import');
      expect(importNode).toBeDefined();
      expect(importNode.directive.kind).toBe('import');
      
      // Check the path contains the variable
      expect(importNode.directive.path.raw).toBe('{{import_path}}');
      
      // Check that variables array contains 'import_path'
      expect(importNode.directive.path.structured.variables.text).toContain('import_path');
    });
  });

  describe('@run directive', () => {
    it('should handle bracketed variable syntax', async () => {
      const input = '@text command = "npm test"\n\n@run [{{command}}]';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, run directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with run directive
      const runNode = result.ast.find(node => node.directive?.kind === 'run');
      expect(runNode).toBeDefined();
      expect(runNode.directive.kind).toBe('run');
      
      // Check the command contains the variable reference
      expect(runNode.directive.command).toBe('{{command}}');
    });

    it('should handle non-bracketed variable syntax', async () => {
      const input = '@text command = "npm test"\n\n@run {{command}}';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, run directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with run directive
      const runNode = result.ast.find(node => node.directive?.kind === 'run');
      expect(runNode).toBeDefined();
      expect(runNode.directive.kind).toBe('run');
      
      // Check the command contains the variable reference
      expect(runNode.directive.command).toBe('{{command}}');
    });
  });
}); 