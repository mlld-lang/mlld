import { ErrorFactory } from '../factory';
import {
  MeldParseError,
  MeldInterpretError,
  MeldImportError,
  MeldDirectiveError,
  MeldEmbedError
} from '../errors';

describe('ErrorFactory', () => {
  describe('error creation', () => {
    it('should create parse error with location', () => {
      const location = { line: 1, column: 1 };
      const error = ErrorFactory.createParseError('test error', location);
      expect(error).toBeInstanceOf(MeldParseError);
      expect(error.message).toBe('test error');
      expect(error.location).toBe(location);
    });

    it('should create interpret error with location and node type', () => {
      const location = { line: 1, column: 1 };
      const error = ErrorFactory.createInterpretError('test error', 'test-node', location);
      expect(error).toBeInstanceOf(MeldInterpretError);
      expect(error.message).toBe('test error');
      expect(error.nodeType).toBe('test-node');
      expect(error.location).toBe(location);
    });

    it('should create import error with location', () => {
      const location = { line: 1, column: 1 };
      const error = ErrorFactory.createImportError('test error', location);
      expect(error).toBeInstanceOf(MeldImportError);
      expect(error.message).toBe('test error');
      expect(error.location).toBe(location);
    });

    it('should create directive error with location and kind', () => {
      const location = { line: 1, column: 1 };
      const error = ErrorFactory.createDirectiveError('test error', 'test-directive', location);
      expect(error).toBeInstanceOf(MeldDirectiveError);
      expect(error.message).toBe('test error');
      expect(error.directiveKind).toBe('test-directive');
      expect(error.location).toBe(location);
    });

    it('should create embed error with location', () => {
      const location = { line: 1, column: 1 };
      const error = ErrorFactory.createEmbedError('test error', location);
      expect(error).toBeInstanceOf(MeldEmbedError);
      expect(error.message).toBe('test error');
      expect(error.location).toBe(location);
    });
  });

  describe('location adjustment', () => {
    it('should adjust location based on base location', () => {
      const location = { line: 2, column: 3 };
      const baseLocation = { line: 10, column: 5 };
      const adjusted = ErrorFactory.adjustLocation(location, baseLocation);
      expect(adjusted).toEqual({
        line: 11,  // location.line + baseLocation.line - 1
        column: 3  // location.column (since line > 1)
      });
    });

    it('should adjust column only for first line', () => {
      const location = { line: 1, column: 3 };
      const baseLocation = { line: 10, column: 5 };
      const adjusted = ErrorFactory.adjustLocation(location, baseLocation);
      expect(adjusted).toEqual({
        line: 10,  // location.line + baseLocation.line - 1
        column: 7  // location.column + baseLocation.column - 1
      });
    });
  });

  describe('createWithAdjustedLocation', () => {
    it('should create error with adjusted location', () => {
      const location = { line: 2, column: 3 };
      const baseLocation = { line: 10, column: 5 };
      const error = ErrorFactory.createWithAdjustedLocation(
        ErrorFactory.createDirectiveError,
        'test error',
        location,
        baseLocation,
        'test-directive'
      );
      expect(error).toBeInstanceOf(MeldDirectiveError);
      expect(error.message).toBe('test error');
      expect(error.directiveKind).toBe('test-directive');
      expect(error.location).toEqual({
        line: 11,
        column: 3
      });
    });
  });
}); 