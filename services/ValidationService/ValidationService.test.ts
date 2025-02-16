import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from './ValidationService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import {
  createTextDirective,
  createDataDirective,
  createImportDirective,
  createEmbedDirective,
  createLocation
} from '@tests/utils/testFactories.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';

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
      const validator = async () => {};
      service.registerValidator('custom', validator);
      expect(service.hasValidator('custom')).toBe(true);
    });
    
    it('should throw on invalid validator registration', () => {
      expect(() => service.registerValidator('', async () => {}))
        .toThrow('Validator kind must be a non-empty string');
      expect(() => service.registerValidator('test', null as any))
        .toThrow('Validator must be a function');
    });
    
    it('should remove a validator', () => {
      service.registerValidator('custom', async () => {});
      expect(service.hasValidator('custom')).toBe(true);
      service.removeValidator('custom');
      expect(service.hasValidator('custom')).toBe(false);
    });
  });
  
  describe('Text directive validation', () => {
    it('should validate a valid text directive', async () => {
      const node = createTextDirective('greeting', 'Hello', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on missing name', async () => {
      const node = createTextDirective('', 'Hello', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
    
    it('should throw on missing value', async () => {
      const node = createTextDirective('greeting', '', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
    
    it('should throw on invalid name format', async () => {
      const node = createTextDirective('123invalid', 'Hello', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
  });
  
  describe('Data directive validation', () => {
    it('should validate a valid data directive with string value', async () => {
      const node = createDataDirective('config', '{"key": "value"}', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate a valid data directive with object value', async () => {
      const node = createDataDirective('config', { key: 'value' }, createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on invalid JSON string', async () => {
      const node = createDataDirective('config', '{invalid json}', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
    
    it('should throw on missing name', async () => {
      const node = createDataDirective('', { key: 'value' }, createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
    
    it('should throw on invalid name format', async () => {
      const node = createDataDirective('123invalid', { key: 'value' }, createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
  });
  
  describe('Import directive validation', () => {
    it('should validate a valid import directive', async () => {
      const node = createImportDirective('test.md', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on missing path', async () => {
      const node = createImportDirective('', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
  });
  
  describe('Embed directive validation', () => {
    it('should validate a valid embed directive', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate embed directive without section', async () => {
      const node = createEmbedDirective('test.md', undefined, createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on missing path', async () => {
      const node = createEmbedDirective('', undefined, createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
    
    it('should validate fuzzy matching threshold', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = 0.8;
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on invalid fuzzy threshold (below 0)', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = -0.1;
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
    
    it('should throw on invalid fuzzy threshold (above 1)', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = 1.1;
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
  });
  
  describe('Unknown directive handling', () => {
    it('should throw on unknown directive kind', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'unknown'
        },
        location: createLocation(1, 1)
      };
      
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.HANDLER_NOT_FOUND
      });
    });
  });
}); 