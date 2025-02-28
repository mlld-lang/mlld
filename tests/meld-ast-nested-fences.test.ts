import { describe, it, expect } from 'vitest';
import { parse } from 'meld-ast';

describe('meld-ast nested code fence behavior', () => {
  it('should terminate code fence with same-length backticks', async () => {
    const content = '```\nouter\n```';
    
    const result = await parse(content, {
      preserveCodeFences: true,
      failFast: false,
      trackLocations: true,
      validateNodes: true
    });

    console.log('Parse result:', JSON.stringify(result, null, 2));
    
    expect(result.ast).toBeDefined();
    expect(result.ast).toHaveLength(1);
    expect(result.ast.at(0).type).toBe('CodeFence');
    expect(result.ast.at(0).content).toBe('```\nouter\n```');
  });

  it('should preserve inner fences when outer fence has more backticks', async () => {
    const content = '````\nouter\n```\ninner\n```\n````';
    
    const result = await parse(content, {
      preserveCodeFences: true,
      failFast: false,
      trackLocations: true,
      validateNodes: true
    });

    console.log('Parse result:', JSON.stringify(result, null, 2));
    
    expect(result.ast).toBeDefined();
    expect(result.ast).toHaveLength(1);
    expect(result.ast.at(0).type).toBe('CodeFence');
    expect(result.ast.at(0).content).toBe('````\nouter\n```\ninner\n```\n````');
  });

  it('should handle language identifiers and termination correctly', async () => {
    const content = '```typescript\nconst x = 1;\n```';
    
    const result = await parse(content, {
      preserveCodeFences: true,
      failFast: false,
      trackLocations: true,
      validateNodes: true
    });

    console.log('Parse result:', JSON.stringify(result, null, 2));
    
    expect(result.ast).toBeDefined();
    expect(result.ast).toHaveLength(1);
    expect(result.ast.at(0).type).toBe('CodeFence');
    expect(result.ast.at(0).language).toBe('typescript');
    expect(result.ast.at(0).content).toBe('```typescript\nconst x = 1;\n```');
  });

  it('should handle language identifiers with nested fences', async () => {
    const content = '````typescript\nouter\n```js\ninner\n```\n````';
    
    const result = await parse(content, {
      preserveCodeFences: true,
      failFast: false,
      trackLocations: true,
      validateNodes: true
    });

    console.log('Parse result:', JSON.stringify(result, null, 2));
    
    expect(result.ast).toBeDefined();
    expect(result.ast).toHaveLength(1);
    expect(result.ast.at(0).type).toBe('CodeFence');
    expect(result.ast.at(0).language).toBe('typescript');
    expect(result.ast.at(0).content).toBe('````typescript\nouter\n```js\ninner\n```\n````');
  });
}); 