import { describe, it, expect } from 'vitest';
import MlldSyntaxGenerator from './build-syntax.js';

describe('MlldSyntaxGenerator', () => {
  const generator = new MlldSyntaxGenerator();

  it('includes newer directive families in the generated keyword list', () => {
    expect(generator.directives).toEqual(expect.arrayContaining([
      'auth',
      'box',
      'file',
      'files',
      'needs',
      'profiles',
      'while'
    ]));
  });

  it('keeps regex patterns aligned with newer keyword forms', () => {
    expect(generator.patterns.guardFilter).toContain('log');
    expect(generator.patterns.guardFilter).toContain('stream');
    expect(generator.patterns.operators).toContain('tools');
    expect(generator.patterns.operators).toContain('mcp');
    expect(generator.patterns.operators).toContain('using');
    expect(generator.patterns.directiveForms).toContain('profiles');
    expect(generator.patterns.directiveForms).toContain('loop');
  });

  it('supports hyphenated identifiers in variable and object-key patterns', () => {
    const variableRegex = new RegExp(`^${generator.patterns.variable}$`);
    expect(variableRegex.test('@max-iterations')).toBe(true);

    const objectKeyRegex = new RegExp(generator.patterns.objectKey);
    expect('max-retries: 3'.match(objectKeyRegex)?.[0]).toBe('max-retries');
  });

  it('emits inline and block keyword patterns for TextMate grammars', () => {
    const patternNames = generator.generateTextMatePatterns().map(pattern => pattern.name);
    expect(patternNames).toContain('keyword.control.directive.inline.mlld');
    expect(patternNames).toContain('keyword.control.block.mlld');
    expect(patternNames).toContain('keyword.control.flow.mlld');
  });
});
