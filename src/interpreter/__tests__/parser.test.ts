import { parseMeldContent } from '../parser.js';
import { parse } from 'meld-ast';

jest.mock('meld-ast', () => ({
  parse: jest.fn()
}));

describe('parseMeldContent', () => {
  it('should successfully parse valid Meld content', () => {
    const mockAst = [{ type: 'Text', content: 'Hello' }];
    (parse as jest.Mock).mockReturnValue(mockAst);

    const content = 'Hello';
    const result = parseMeldContent(content);

    expect(result).toEqual(mockAst);
    expect(parse).toHaveBeenCalledWith(content);
  });

  it('should throw error when parsing fails with Error instance', () => {
    (parse as jest.Mock).mockImplementation(() => {
      throw new Error('Parse error');
    });

    expect(() => parseMeldContent('invalid')).toThrow(
      'Failed to parse Meld content: Parse error'
    );
  });

  it('should handle non-Error errors', () => {
    (parse as jest.Mock).mockImplementation(() => {
      throw 'Some error';
    });

    expect(() => parseMeldContent('invalid')).toThrow(
      'Failed to parse Meld content: Some error'
    );
  });
}); 