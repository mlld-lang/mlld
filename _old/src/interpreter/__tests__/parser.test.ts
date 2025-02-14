import { describe, it, expect } from 'vitest';
import { parseMeld } from '../parser.js';
import { MeldParseError } from '../errors/errors.js';
import { TestContext } from './test-utils';

describe('parseMeld', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
  });

  it('should parse text nodes', () => {
    const result = parseMeld('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Text');
    expect(result[0].content).toBe('Hello world');
    expect(result[0].location).toBeDefined();
  });

  it('should parse directive nodes', () => {
    const result = parseMeld('@data name="test" value="value"');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Directive');
    expect(result[0].directive.kind).toBe('data');
    expect(result[0].location).toBeDefined();
  });

  it('should preserve locations in parsed nodes', () => {
    const input = `
Hello world
@data name="test"
    `;
    const result = parseMeld(input);
    expect(result).toHaveLength(2);
    expect(result[0].location?.start.line).toBe(2);
    expect(result[1].location?.start.line).toBe(3);
  });

  it('should throw parse error for invalid syntax', () => {
    expect(() => parseMeld('@invalid-directive')).toThrow(MeldParseError);
  });

  it('should handle nested directives', () => {
    const input = `@data name="outer" {
      @data name="inner" value="test"
    }`;
    const result = parseMeld(input);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Directive');
    const directive = result[0] as any;
    expect(directive.directive.kind).toBe('data');
    expect(directive.directive.name).toBe('outer');
    expect(directive.children).toBeDefined();
    expect(directive.children[0].directive.name).toBe('inner');
  });
}); 