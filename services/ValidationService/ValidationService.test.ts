import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from './ValidationService';
import { MeldDirectiveError } from '../../core/errors/MeldDirectiveError';
import {
  createTextDirective,
  createDataDirective,
  createImportDirective,
  createEmbedDirective,
  createLocation
} from '../../tests/utils/testFactories';

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
      const node = createTextDirective('greeting', 'Hello', createLocation(1, 1));
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should throw on missing name', () => {
      const node = createTextDirective('', 'Hello', createLocation(1, 1));
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
    });
    
    it('should throw on missing value', () => {
      const node = createTextDirective('greeting', '', createLocation(1, 1));
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
    });
    
    it('should throw on invalid name format', () => {
      const node = createTextDirective('123invalid', 'Hello', createLocation(1, 1));
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
    });
  });
  
  describe('Data directive validation', () => {
    it('should validate a valid data directive with string value', () => {
      const node = createDataDirective('config', '{"key": "value"}', createLocation(1, 1));
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should validate a valid data directive with object value', () => {
      const node = createDataDirective('config', { key: 'value' }, createLocation(1, 1));
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should throw on invalid JSON string', () => {
      const node = createDataDirective('config', '{invalid json}', createLocation(1, 1));
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
    });
    
    it('should throw on missing name', () => {
      const node = createDataDirective('', { key: 'value' }, createLocation(1, 1));
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
    });
    
    it('should throw on invalid name format', () => {
      const node = createDataDirective('123invalid', { key: 'value' }, createLocation(1, 1));
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
    });
  });
  
  describe('Import directive validation', () => {
    it('should validate a valid import directive', () => {
      const node = createImportDirective('test.md', createLocation(1, 1));
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should throw on missing path', () => {
      const node = createImportDirective('', createLocation(1, 1));
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
    });
  });
  
  describe('Embed directive validation', () => {
    it('should validate a valid embed directive', () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should validate embed directive without section', () => {
      const node = createEmbedDirective('test.md', undefined, createLocation(1, 1));
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should throw on missing path', () => {
      const node = createEmbedDirective('', undefined, createLocation(1, 1));
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
    });
    
    it('should validate fuzzy matching threshold', () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = 0.8;
      expect(() => service.validate(node)).not.toThrow();
    });
    
    it('should throw on invalid fuzzy threshold (below 0)', () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = -0.1;
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
    });
    
    it('should throw on invalid fuzzy threshold (above 1)', () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = 1.1;
      expect(() => service.validate(node)).toThrow(MeldDirectiveError);
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