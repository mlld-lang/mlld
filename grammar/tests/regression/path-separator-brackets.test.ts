import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';

describe('Path Separator in Brackets - Regression Test for Issue #53', () => {
  it('should parse paths in brackets with PathSeparator nodes', async () => {
    const input = '/add [path/to/file.md]';
    const parseResult = await parse(input);
    const result = parseResult.ast;
    
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Directive');
    expect(result[0].kind).toBe('show');
    expect(result[0].subtype).toBe('showPath');
    
    // Check that path array contains PathSeparator nodes
    const pathArray = result[0].values.path;
    expect(pathArray).toHaveLength(5);
    
    // Verify structure: Text, PathSeparator, Text, PathSeparator, Text
    expect(pathArray[0].type).toBe('Text');
    expect(pathArray[0].content).toBe('path');
    
    expect(pathArray[1].type).toBe('PathSeparator');
    expect(pathArray[1].value).toBe('/');
    
    expect(pathArray[2].type).toBe('Text');
    expect(pathArray[2].content).toBe('to');
    
    expect(pathArray[3].type).toBe('PathSeparator');
    expect(pathArray[3].value).toBe('/');
    
    expect(pathArray[4].type).toBe('Text');
    expect(pathArray[4].content).toBe('file.md');
  });

  it('should parse paths in text directive brackets with PathSeparator nodes', async () => {
    const input = '/text @content = [path/to/file.md]';
    const parseResult = await parse(input);
    const result = parseResult.ast;
    
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Directive');
    expect(result[0].kind).toBe('var');
    expect(result[0].subtype).toBe('textPath');
    expect(result[0].source).toBe('path');
    
    // Check that path array contains PathSeparator nodes
    const contentArray = result[0].values.path;
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
    const input = '/add [deep/nested/path/to/file.md]';
    const parseResult = await parse(input);
    const result = parseResult.ast;
    
    const pathArray = result[0].values.path;
    expect(pathArray).toHaveLength(9); // 5 text segments + 4 separators
    
    // Verify all separators are present
    expect(pathArray[1].type).toBe('PathSeparator');
    expect(pathArray[3].type).toBe('PathSeparator');
    expect(pathArray[5].type).toBe('PathSeparator');
    expect(pathArray[7].type).toBe('PathSeparator');
  });

  it('should handle paths with variables and separators', async () => {
    const input = '/text @mypath = [@root/path/to/file.md]';
    const parseResult = await parse(input);
    const result = parseResult.ast;
    
    expect(result[0].subtype).toBe('textPath');
    const contentArray = result[0].values.path;
    
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