import { describe, expect, it } from 'vitest';
import { cleanNamespaceForDisplay } from './namespace-display';

describe('namespace-display helper', () => {
  it('formats frontmatter, variables, and executables with stable shape', () => {
    const rendered = cleanNamespaceForDisplay({
      fm: { title: 'Demo' },
      count: { value: 3 },
      name: 'Ada',
      callable: { __executable: true, paramNames: ['value'] },
      typedExecutable: {
        type: 'executable',
        value: { paramNames: ['left', 'right'] }
      }
    });

    expect(rendered).toContain('\n  "frontmatter"');
    expect(rendered).toContain('\n  "exports"');

    expect(JSON.parse(rendered)).toEqual({
      frontmatter: { title: 'Demo' },
      exports: {
        variables: {
          count: 3,
          name: 'Ada'
        },
        executables: {
          callable: '<function(value)>',
          typedExecutable: '<function(left, right)>'
        }
      }
    });
  });

  it('filters internal keys from exported entries', () => {
    const rendered = cleanNamespaceForDisplay({
      fm: { title: 'A' },
      frontmatter: { title: 'B' },
      __meta__: { title: 'C' },
      visible: 42
    });

    const parsed = JSON.parse(rendered);
    expect(parsed.frontmatter).toEqual({ title: 'A' });
    expect(parsed.exports.variables).toEqual({ visible: 42 });
    expect(parsed.exports.variables.fm).toBeUndefined();
    expect(parsed.exports.variables.frontmatter).toBeUndefined();
    expect(parsed.exports.variables.__meta__).toBeUndefined();
  });

  it('returns empty object display when namespace has no displayable values', () => {
    expect(cleanNamespaceForDisplay({})).toBe('{}');
    expect(cleanNamespaceForDisplay({ fm: {}, frontmatter: {}, __meta__: {} })).toBe('{}');
  });

  it('omits frontmatter key when only exports exist', () => {
    const rendered = cleanNamespaceForDisplay({
      only: { value: 'x' }
    });

    expect(JSON.parse(rendered)).toEqual({
      exports: {
        variables: { only: 'x' },
        executables: {}
      }
    });
  });
});
