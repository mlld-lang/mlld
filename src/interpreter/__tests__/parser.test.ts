import { describe, it, expect, vi } from 'vitest';
import { parseMeldContent } from '../parser.js';
import { parse } from 'meld-ast';

vi.mock('meld-ast', () => ({
  parse: vi.fn()
}));

describe('parseMeldContent', () => {
  it('should parse valid Meld content', () => {
    const mockContent = '# Test Content';
    const mockAst = [{ type: 'Text', content: mockContent }];
    vi.mocked(parse).mockReturnValue(mockAst);

    const result = parseMeldContent(mockContent);
    expect(result).toEqual(mockAst);
    expect(parse).toHaveBeenCalledWith(mockContent);
  });

  it('should throw error for invalid content', () => {
    const mockContent = 'invalid content';
    vi.mocked(parse).mockImplementation(() => {
      throw new Error('Parse error');
    });

    expect(() => parseMeldContent(mockContent)).toThrow('Parse error');
  });
}); 