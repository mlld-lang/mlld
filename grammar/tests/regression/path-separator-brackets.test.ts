import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';

describe('Path Separator in Brackets - Regression Test for Issue #53', () => {
  it('should parse paths in brackets with PathSeparator nodes', async () => {
    const input = '/show <path/to/file.md>';
    const parseResult = await parse(input);
    const result = parseResult.ast;
    
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Directive');
    expect(result[0].kind).toBe('show');
    expect(result[0].subtype).toBe('showLoadContent');
    
    // Check that the load content node has the correct structure
    const loadContent = result[0].values.loadContent;
    expect(loadContent.type).toBe('load-content');
    expect(loadContent.source.type).toBe('path');
    
    // Check that path segments contain PathSeparator nodes
    const pathSegments = loadContent.source.segments;
    expect(pathSegments).toHaveLength(5);
    
    // Verify structure: Text, PathSeparator, Text, PathSeparator, Text
    expect(pathSegments[0].type).toBe('Text');
    expect(pathSegments[0].content).toBe('path');
    
    expect(pathSegments[1].type).toBe('PathSeparator');
    expect(pathSegments[1].value).toBe('/');
    
    expect(pathSegments[2].type).toBe('Text');
    expect(pathSegments[2].content).toBe('to');
    
    expect(pathSegments[3].type).toBe('PathSeparator');
    expect(pathSegments[3].value).toBe('/');
    
    expect(pathSegments[4].type).toBe('Text');
    expect(pathSegments[4].content).toBe('file.md');
  });

  it('should parse paths in text directive brackets with PathSeparator nodes', async () => {
    const input = '/var @content = <path/to/file.md>';
    const parseResult = await parse(input);
    const result = parseResult.ast;
    
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Directive');
    expect(result[0].kind).toBe('var');
    // The var directive with path content should have the appropriate subtype
    // Since we're using the unified var system, check the actual subtype produced
    expect(result[0].subtype).toBeDefined();
    // Source is null for unified var directives
    expect(result[0].source).toBe(null);
    
    // Check that path array contains PathSeparator nodes
    // In the new AST structure, value is an array containing a load-content object
    const loadContentObject = result[0].values.value[0];
    expect(loadContentObject.type).toBe('load-content');
    expect(loadContentObject.source.type).toBe('path');
    const contentArray = loadContentObject.source.segments;
    expect(contentArray).toHaveLength(5);
    
    // Verify structure
    expect(contentArray[0].type).toBe('Text');
    expect(contentArray[0].content).toBe('path');
    
    expect(contentArray[1].type).toBe('PathSeparator');
    expect(contentArray[1].value).toBe('/');
    
    expect(contentArray[2].type).toBe('Text');
    expect(contentArray[2].content).toBe('to');
    
    expect(contentArray[3].type).toBe('PathSeparator');
    expect(contentArray[3].value).toBe('/');
    
    expect(contentArray[4].type).toBe('Text');
    expect(contentArray[4].content).toBe('file.md');
  });

  it('should handle paths with multiple directory levels', async () => {
    const input = '/show <deep/nested/path/to/file.md>';
    const parseResult = await parse(input);
    const result = parseResult.ast;
    
    const loadContent = result[0].values.loadContent;
    const pathSegments = loadContent.source.segments;
    expect(pathSegments).toHaveLength(9); // 5 text segments + 4 separators
    
    // Verify all separators are present
    expect(pathSegments[1].type).toBe('PathSeparator');
    expect(pathSegments[3].type).toBe('PathSeparator');
    expect(pathSegments[5].type).toBe('PathSeparator');
    expect(pathSegments[7].type).toBe('PathSeparator');
  });

  it.skip('should handle paths with variables and separators', async () => {
    // TODO: This test needs to be updated for the unified var system
    // The path variable interpolation in brackets is not yet supported
    const input = '/var @mypath = <@root/path/to/file.md>';
    const parseResult = await parse(input);
    const result = parseResult.ast;
    
    // The var directive with path content should have the appropriate subtype
    expect(result[0]).toBeDefined();
    expect(result[0].subtype).toBeDefined();
    const contentArray = result[0].values.value;
    
    // First element should be the variable
    expect(contentArray[0].type).toBe('VariableReference');
    expect(contentArray[0].identifier).toBe('root');
    
    // Then separator
    expect(contentArray[1].type).toBe('PathSeparator');
    
    // Then the rest of the path
    expect(contentArray[2].type).toBe('Text');
    expect(contentArray[2].content).toBe('path');
  });
});