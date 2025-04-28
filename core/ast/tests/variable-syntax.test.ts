/// <reference types="vitest" />
import { describe, expect, it } from 'vitest';
import { parse } from '@core/ast';
import { VariableReferenceNode, TextNode } from '@core/syntax/types';
import { DirectiveNode } from '@core/ast/types';

describe('Unified variable syntax', () => {
  it('should parse text variables with {{variable}} syntax', async () => {
    const input = 'Hello {{name}}!';
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(3);
    
    // Text node "Hello "
    expect(result.ast[0].type).toBe('Text');
    expect((result.ast[0] as TextNode).content).toBe('Hello ');
    
    // Variable node
    const varNode = result.ast[1] as VariableReferenceNode;
    expect(varNode.type).toBe('VariableReference');
    expect(varNode.identifier).toBe('name');
    expect(varNode.valueType).toBe('text');
    expect(varNode.isVariableReference).toBe(true);
    
    // Text node "!"
    expect(result.ast[2].type).toBe('Text');
    expect(result.ast[2].content).toBe('!');
  });
  
  it('should parse data variables with {{variable}} syntax', async () => {
    const input = 'Hello {{user.name}}';
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(2);
    const varNode = result.ast[1] as VariableReferenceNode;
    expect(varNode.type).toBe('VariableReference');
    expect(varNode.identifier).toBe('user');
    expect(varNode.fields).toEqual([{ type: 'field', value: 'name' }]);
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
  });
  
  it('should distinguish between text and data variables using fields', async () => {
    const input = 'Text {{text}} and data {{data.field}}';
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(4);
    
    const textVar = result.ast.find(node => node.type === 'VariableReference') as VariableReferenceNode | undefined;
    expect(textVar).toBeDefined();
    expect(textVar?.valueType).toBe('text');
    expect(textVar?.isVariableReference).toBe(true);
    
    const dataVar = result.ast.find(node => node.type === 'VariableReference' && (node as VariableReferenceNode).valueType === 'data') as VariableReferenceNode | undefined;
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
    const directiveNode = result.ast[0] as DirectiveNode;
    expect(directiveNode.directive.kind).toBe('text');
    expect(directiveNode.directive.identifier).toBe('template');
    expect(directiveNode.directive.values).toEqual([
      expect.objectContaining({ type: 'Text', content: '\nHello ' }),
      expect.objectContaining({ type: 'VariableReference', identifier: 'name', valueType: 'text', isVariableReference: true }),
      expect.objectContaining({ type: 'Text', content: '!\nWelcome to ' }),
      expect.objectContaining({ 
        type: 'VariableReference', 
        identifier: 'site', 
        valueType: 'data', 
        isVariableReference: true,
        fields: [ expect.objectContaining({ type: 'field', value: 'title' }) ] 
      }),
      expect.objectContaining({ type: 'Text', content: '.\n' })
    ]);
  });
  
  it('should preserve path variables with $variable syntax', async () => {
    const input = '@embed [$PROJECTPATH/file.md]';
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(1);
    expect(result.ast[0].type).toBe('Directive');
    const directiveNode = result.ast[0] as DirectiveNode;
    expect(directiveNode.directive.kind).toBe('embed');
    expect(directiveNode.directive.path.raw).toBe('$PROJECTPATH/file.md');
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
      const embedNode = result.ast.find(node => node.directive?.kind === 'embed') as DirectiveNode;
      expect(embedNode).toBeDefined();
      expect(embedNode.directive.kind).toBe('embed');
      
      // Check the path contains the variable
      expect(embedNode.directive.path.raw).toBe('{{file_path}}');
      
      // Check the values array contains the variable reference
      expect(embedNode.directive.path.values).toEqual([
        expect.objectContaining({
          type: 'VariableReference',
          identifier: 'file_path',
          valueType: 'text',
          isVariableReference: true
        })
      ]);
    });

    it('should handle non-bracketed text variable syntax', async () => {
      const input = '@text content = "Some content"\n\n@embed {{content}}';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, embed directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with embed directive
      const embedNode = result.ast.find(node => node.directive?.kind === 'embed') as DirectiveNode;
      expect(embedNode).toBeDefined();
      expect(embedNode.directive.kind).toBe('embed');
      
      // Check the values array contains the variable reference
      expect(embedNode.directive.values).toEqual([
        expect.objectContaining({
          type: 'VariableReference',
          identifier: 'content',
          valueType: 'text',
          isVariableReference: true
        })
      ]);
    });

    it('should handle path variable syntax', async () => {
      const input = '@text file_path = "test-file.md"\n\n@embed [$file_path]';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, embed directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with embed directive
      const embedNode = result.ast.find(node => node.type === 'Directive' && (node as DirectiveNode).directive.kind === 'embed') as DirectiveNode;
      expect(embedNode).toBeDefined();
      expect(embedNode.directive.kind).toBe('embed');
      
      // Check the path contains the variable
      expect(embedNode.directive.path.raw).toBe('$file_path');
      
      // Check the values array contains the variable reference
      expect(embedNode.directive.path.values).toEqual([
        expect.objectContaining({
          type: 'VariableReference',
          identifier: 'file_path',
          valueType: 'path',
          isVariableReference: true
        })
      ]);
    });
  });

  describe('@import directive', () => {
    it('should handle bracketed variable syntax', async () => {
      const input = '@text import_path = "./components/Button.jsx"\n\n@import [{{import_path}}]';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, import directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with import directive
      const importNode = result.ast.find(node => node.type === 'Directive' && (node as DirectiveNode).directive.kind === 'import') as DirectiveNode;
      expect(importNode).toBeDefined();
      expect(importNode.directive.kind).toBe('import');
      
      // Check the path contains the variable
      expect(importNode.directive.path.raw).toBe('{{import_path}}');
      
      // Check the values array contains the variable reference
      expect(importNode.directive.path.values).toEqual([
        expect.objectContaining({
          type: 'VariableReference',
          identifier: 'import_path',
          valueType: 'text',
          isVariableReference: true
        })
      ]);
    });

    it('should handle non-bracketed variable syntax', async () => {
      const input = '@text import_path = "./components/Button.jsx"\n\n@import {{import_path}}';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, import directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with import directive
      const importNode = result.ast.find(node => node.type === 'Directive' && (node as DirectiveNode).directive.kind === 'import') as DirectiveNode;
      expect(importNode).toBeDefined();
      expect(importNode.directive.kind).toBe('import');
      
      // Check the path contains the variable
      expect(importNode.directive.path.raw).toBe('{{import_path}}');
      
      // Check the values array contains the variable reference
      expect(importNode.directive.path.values).toEqual([
        expect.objectContaining({
          type: 'VariableReference',
          identifier: 'import_path',
          valueType: 'text',
          isVariableReference: true
        })
      ]);
    });
  });

  describe('@run directive', () => {
    it('should handle bracketed variable syntax', async () => {
      const input = '@text command = "npm test"\n\n@run [{{command}}]';
      const result = await parse(input);
      
      // Expect three nodes: text directive, newlines, run directive
      expect(result.ast.length).toBe(3);
      
      // Check the node with run directive
      const runNode = result.ast.find(node => node.type === 'Directive' && (node as DirectiveNode).directive.kind === 'run') as DirectiveNode;
      expect(runNode).toBeDefined();
      expect(runNode.directive.kind).toBe('run');
      
      // Check the command contains the variable reference
      expect(runNode.directive.values).toEqual([
        expect.objectContaining({
          type: 'VariableReference',
          identifier: 'command',
          valueType: 'text',
          isVariableReference: true
        })
      ]);
    });

    it('should handle non-bracketed path variable syntax', async () => {
      const input = '@run $command';
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const node = result.ast.find(node => node.type === 'Directive' && (node as DirectiveNode).directive.kind === 'run') as DirectiveNode;
      expect(node).toBeDefined();
      expect(node.directive.kind).toBe('run');
      
      // Check the command reference structure
      expect(node.directive.raw).toBe('$command');
    });
  });
});