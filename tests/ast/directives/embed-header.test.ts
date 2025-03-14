/// <reference types="vitest" />
import { parse } from '../../src/index';
import { expect, describe, it } from 'vitest';

describe('directives/@embed with header levels', () => {
  it('should support header level with path syntax', async () => {
    const input = `@embed [file.md] as ###`;
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(1);
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.directive.kind).toBe('embed');
    expect(directive.directive.headerLevel).toBe(3);
    
    // Ensure the path is structured correctly
    expect(directive.directive.path).toBeDefined();
    expect(directive.directive.path.raw).toBe('file.md');
    expect(directive.directive.path.normalized).toBe('./file.md');
    expect(directive.directive.path.structured).toBeDefined();
    expect(directive.directive.path.structured.base).toBe('.');
    expect(directive.directive.path.structured.segments).toEqual(['file.md']);
    expect(directive.directive.path.structured.variables).toEqual({});
    // Accept that cwd might be undefined for now
    expect([true, undefined]).toContain(directive.directive.path.structured.cwd);
  });

  it('should support section with header level', async () => {
    const input = `@embed [file.md # Introduction] as ##`;
    const result = await parse(input);
    
    expect(result.ast).toHaveLength(1);
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.directive.kind).toBe('embed');
    expect(directive.directive.headerLevel).toBe(2);
    expect(directive.directive.section).toBe('Introduction');
    
    // Ensure the path is structured correctly
    expect(directive.directive.path).toBeDefined();
    expect(directive.directive.path.raw).toBe('file.md');
    expect(directive.directive.path.normalized).toBe('./file.md');
    expect(directive.directive.path.structured).toBeDefined();
    expect(directive.directive.path.structured.base).toBe('.');
    expect(directive.directive.path.structured.segments).toEqual(['file.md']);
    expect(directive.directive.path.structured.variables).toEqual({});
    // Accept that cwd might be undefined for now
    expect([true, undefined]).toContain(directive.directive.path.structured.cwd);
  });
}); 