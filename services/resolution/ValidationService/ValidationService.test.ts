import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from './ValidationService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import {
  createTextDirective,
  createDataDirective,
  createImportDirective,
  createEmbedDirective,
  createPathDirective,
  createLocation
} from '@tests/utils/testFactories.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';

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
      expect(kinds).toContain('path');
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
    
    it('should throw on missing name with recoverable severity', async () => {
      const node = createTextDirective('', 'Hello', createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });
    
    it('should throw on missing value with recoverable severity', async () => {
      const node = createTextDirective('greeting', '', createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });
    
    it('should throw on invalid name format with recoverable severity', async () => {
      const node = createTextDirective('123invalid', 'Hello', createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
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
    
    it('should throw on invalid JSON string with recoverable severity', async () => {
      const node = createDataDirective('config', '{invalid json}', createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });
    
    it('should throw on missing name with recoverable severity', async () => {
      const node = createDataDirective('', { key: 'value' }, createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });
    
    it('should throw on invalid name format with recoverable severity', async () => {
      const node = createDataDirective('123invalid', { key: 'value' }, createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });
  });
  
  describe('Path directive validation', () => {
    it('should validate a valid path directive with $HOMEPATH', async () => {
      const node = createPathDirective('docs', '$HOMEPATH/docs', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid path directive with $PROJECTPATH', async () => {
      const node = createPathDirective('src', '$PROJECTPATH/src', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid path directive with $~', async () => {
      const node = createPathDirective('config', '$~/config', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid path directive with $.', async () => {
      const node = createPathDirective('test', '$./test', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on missing identifier with recoverable severity', async () => {
      const node = createPathDirective('', '$HOMEPATH/docs', createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });

    it('should throw on invalid identifier format with recoverable severity', async () => {
      const node = createPathDirective('123invalid', '$HOMEPATH/docs', createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });

    it('should throw on missing value with recoverable severity', async () => {
      const node = createPathDirective('docs', '', createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });

    it('should throw on empty path value with recoverable severity', async () => {
      const node = createPathDirective('docs', '   ', createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });
  });
  
  describe('Import directive validation', () => {
    it('should validate a valid import directive', async () => {
      const node = createImportDirective('test.md', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on missing path with recoverable severity', async () => {
      const node = createImportDirective('', createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
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
    
    it('should throw on missing path with recoverable severity', async () => {
      const node = createEmbedDirective('', undefined, createLocation(1, 1));
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });
    
    it('should validate fuzzy matching threshold', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = 0.8;
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on invalid fuzzy threshold (below 0) with recoverable severity', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = -0.1;
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });
    
    it('should throw on invalid fuzzy threshold (above 1) with recoverable severity', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = 1.1;
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.VALIDATION_FAILED);
        expect(directiveError.severity).toBe(ErrorSeverity.Recoverable);
      }
    });
  });
  
  describe('Unknown directive handling', () => {
    it('should throw on unknown directive kind with fatal severity', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'unknown'
        },
        location: createLocation(1, 1)
      };
      
      try {
        await service.validate(node);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        const directiveError = error as MeldDirectiveError;
        expect(directiveError.code).toBe(DirectiveErrorCode.HANDLER_NOT_FOUND);
        expect(directiveError.severity).toBe(ErrorSeverity.Fatal);
      }
    });
  });
  
  describe('Error handling with canBeWarning', () => {
    it('should identify recoverable errors correctly', async () => {
      const node = createTextDirective('', 'Hello', createLocation(1, 1));
      
      try {
        await service.validate(node);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        const meldError = error as MeldError;
        expect(meldError.canBeWarning()).toBe(true);
      }
    });
    
    it('should identify fatal errors correctly', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'unknown'
        },
        location: createLocation(1, 1)
      };
      
      try {
        await service.validate(node);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        const meldError = error as MeldError;
        expect(meldError.canBeWarning()).toBe(false);
      }
    });
  });
}); 