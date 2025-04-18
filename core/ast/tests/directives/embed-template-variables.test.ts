import { describe, expect, it } from 'vitest';
import { parse } from '@core/ast';

describe('Embed directive with double brackets and variables', () => {
  it('should handle text variables in double bracket content', async () => {
    const input = `@var variable = "value"
@embed [[ This is content with {{variable}} ]]`;
    const result = await parse(input);
    
    expect(result.ast.length).toBeGreaterThan(1);
    const embedNode = result.ast.find(node => 
      node.type === 'Directive' && 
      node.directive.kind === 'embed'
    );
    
    expect(embedNode).toBeDefined();
    // Check for interpolated structure
    expect(embedNode.directive.content).toEqual([
      expect.objectContaining({ type: 'Text', content: ' This is content with ' }),
      expect.objectContaining({ type: 'VariableReference', identifier: 'variable', valueType: 'text' }),
      expect.objectContaining({ type: 'Text', content: ' ' })
    ]);
    // Ensure no warnings are generated
    expect(embedNode.warnings).toBeUndefined();
  });
  
  it('should handle path variables in double bracket content', async () => {
    const input = `@embed [[ This is content with $pathVariable ]]`;
    const result = await parse(input);
    
    expect(result.ast.length).toBe(1);
    const embedNode = result.ast[0];
    
    expect(embedNode.type).toBe('Directive');
    expect(embedNode.directive.kind).toBe('embed');
    // Check for literal structure
    expect(embedNode.directive.content).toEqual([
      expect.objectContaining({ type: 'Text', content: ' This is content with $pathVariable ' })
    ]);
    // Ensure no warnings are generated
    expect(embedNode.warnings).toBeUndefined();
  });
  
  it('should handle complex content with mixed variables', async () => {
    const input = `@data user = {"name": "Alice"}
@embed [[
    This text should highlight differently than {{user.name}} or 
    $thisPathVariable. 
]]`;
    const result = await parse(input);
    
    expect(result.ast.length).toBeGreaterThan(1);
    const embedNode = result.ast.find(node => 
      node.type === 'Directive' && 
      node.directive.kind === 'embed'
    );
    
    expect(embedNode).toBeDefined();
    // Check the full interpolated structure
    const expectedContent = [
      expect.objectContaining({ type: 'Text', content: '\n    This text should highlight differently than ' }),
      expect.objectContaining({ 
        type: 'VariableReference', 
        identifier: 'user', 
        valueType: 'data', 
        fields: [expect.objectContaining({ type: 'field', value: 'name' })]
      }),
      expect.objectContaining({ type: 'Text', content: ' or \n    $thisPathVariable. \n' })
    ];
    expect(embedNode.directive.content).toEqual(expectedContent);
    // Ensure no warnings are generated
    expect(embedNode.warnings).toBeUndefined();
  });
  
  it('should handle the exact case from the bug report', async () => {
    const input = `@embed [[
    This text should highlight differently than {{this.variable}} or 
    $thisPathVariable. 
]]`;
    const result = await parse(input);
    
    expect(result.ast.length).toBe(1);
    const embedNode = result.ast[0];
    
    expect(embedNode.type).toBe('Directive');
    expect(embedNode.directive.kind).toBe('embed');
    // Check the full interpolated structure
    const expectedContent = [
      expect.objectContaining({ type: 'Text', content: '\n    This text should highlight differently than ' }),
      expect.objectContaining({ 
        type: 'VariableReference', 
        identifier: 'this', 
        valueType: 'data',
        fields: [expect.objectContaining({ type: 'field', value: 'variable' })]
      }),
      expect.objectContaining({ type: 'Text', content: ' or \n    $thisPathVariable. \n' })
    ];
    expect(embedNode.directive.content).toEqual(expectedContent);
    // Ensure no warnings are generated
    expect(embedNode.warnings).toBeUndefined();
  });
  
  it('should set isTemplateContent flag for syntax highlighting', async () => {
    const input = `@embed [[
    This text should highlight differently than {{this.variable}} or 
    $thisPathVariable. 
]]`;
    const result = await parse(input);
    
    expect(result.ast.length).toBe(1);
    const embedNode = result.ast[0];
    
    expect(embedNode.type).toBe('Directive');
    expect(embedNode.directive.kind).toBe('embed');
    
    // Check that isTemplateContent flag is set for proper syntax highlighting
    expect(embedNode.directive.isTemplateContent).toBe(true);
    
    // Verify there's no 'path' property as this could confuse syntax highlighters
    expect(embedNode.directive.path).toBeUndefined();
  });
}); 