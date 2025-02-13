import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from './ValidationService';
import type { DirectiveNode, TextDirective, DataDirective, ImportDirective, EmbedDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../core/errors/MeldDirectiveError';

describe('ValidationService', () => {
  let service: ValidationService;
  
  beforeEach(() => {
    service = new ValidationService();
  });
  
  describe('Service initialization', () => {
    it('should initialize with default validators', () => {
      const kinds = service.getRegisteredDirectiveKinds();
      expect(kinds).toContain('text');
      expect(kinds).toContain('data');
      expect(kinds).toContain('import');
      expect(kinds).toContain('embed');
    });
  });
  
  describe('Validator registration', () => {
    it('should register a new validator', () => {
      const validator = () => {};
      service.registerValidator('custom', validator);
      expect(service.hasValidator('custom')).toBe(true);
    });
    
    it('should throw on invalid validator registration', () => {
      expect(() => service.registerValidator('', () => {}))
        .toThrow('Validator kind must be a non-empty string');
      expect(() => service.registerValidator('test', null as any))
        .toThrow('Validator must be a function');
    });
    
    it('should remove a validator', () => {
      service.registerValidator('custom', () => {});
      expect(service.hasValidator('custom')).toBe(true);
      service.removeValidator('custom');
      expect(service.hasValidator('custom')).toBe(false);
    });
  });
  
  describe('Text directive validation', () => {
    it('should validate a valid text directive', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hello'
        } as TextDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should throw on missing name', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          value: 'Hello'
        } as TextDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node))
        .toThrow(MeldDirectiveError);
    });
    
    it('should throw on invalid name format', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: '123invalid',
          value: 'Hello'
        } as TextDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node))
        .toThrow(MeldDirectiveError);
    });
  });
  
  describe('Data directive validation', () => {
    it('should validate a valid data directive with string value', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'data',
          name: 'config',
          value: '{"key": "value"}'
        } as DataDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should validate a valid data directive with object value', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'data',
          name: 'config',
          value: { key: 'value' }
        } as DataDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should throw on invalid JSON string', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'data',
          name: 'config',
          value: '{invalid json}'
        } as DataDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node))
        .toThrow(MeldDirectiveError);
    });
  });
  
  describe('Import directive validation', () => {
    it('should validate a valid import directive', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'import',
          path: 'path/to/file.md'
        } as ImportDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should validate a valid import directive with section', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'import',
          path: 'file.md',
          section: 'Introduction'
        } as ImportDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should throw on empty path', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'import',
          path: ''
        } as ImportDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node))
        .toThrow(MeldDirectiveError);
    });
    
    it('should throw on invalid fuzzy value', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'import',
          path: 'file.md',
          fuzzy: 1.5
        } as ImportDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node))
        .toThrow(MeldDirectiveError);
    });
  });
  
  describe('Embed directive validation', () => {
    it('should validate a valid embed directive', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'path/to/file.md'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should validate a valid embed directive with all options', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'file.md',
          section: 'Introduction',
          fuzzy: 0.8,
          format: 'markdown'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should throw on empty path', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: ''
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node))
        .toThrow(MeldDirectiveError);
    });
    
    it('should throw on invalid format type', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'file.md',
          format: 123 as any
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node))
        .toThrow(MeldDirectiveError);
    });
  });
  
  describe('Unknown directive handling', () => {
    it('should throw on unknown directive kind', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'unknown'
        } as any,
        location: { start: { line: 1, column: 1 } }
      };
      
      expect(() => service.validate(node))
        .toThrow(MeldDirectiveError);
    });
  });
}); 