import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types.js';
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
import { 
  expectDirectiveValidationError, 
  expectToThrowWithConfig,
  expectValidationError,
  expectValidationToThrowWithDetails,
  expectToThrowMeldError, 
  makeDirectiveNode,
  ValidationErrorTestSetup
} from '@tests/utils/errorTestUtils.js';
import { textDirectiveExamples } from '@core/syntax/index.js';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';

describe('ValidationService', () => {
  const helpers = TestContextDI.createTestHelpers();
  let service: IValidationService;
  let context: TestContextDI;
  
  beforeEach(async () => {
    // Use helper
    context = helpers.setupWithStandardMocks();
    // Await init
    await context.resolve('IFileSystemService');
    
    // Resolve the service (expecting real implementation)
    service = await context.resolve('IValidationService');
    
    // Verify we got the real service
    expect(service).toBeInstanceOf(ValidationService);
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  describe('Service initialization', () => {
    it('should initialize with default validators', () => {
      // Access the service resolved in beforeEach
      const kinds = service.getRegisteredDirectiveKinds();
      expect(kinds).toContain('text');
      expect(kinds).toContain('data');
      expect(kinds).toContain('import');
      expect(kinds).toContain('embed');
      expect(kinds).toContain('path');
      expect(kinds).toContain('define'); // Check others if defaults exist
      expect(kinds).toContain('run');
    });
  });
  
  describe('Validator registration', () => {
    // These tests modify the resolved service instance state
    it('should register a new validator', () => {
      const validator = async () => {};
      service.registerValidator('custom', validator);
      // Use the hasValidator method if it exists on the service
      const validationServiceInstance = service as ValidationService;
      expect(validationServiceInstance.hasValidator('custom')).toBe(true);
      // Cleanup: Remove the validator to not affect other tests
      service.removeValidator('custom'); 
    });
    
    it('should throw on invalid validator registration', () => {
      expect(() => service.registerValidator('', async () => {}))
        .toThrow('Validator kind must be a non-empty string');
      expect(() => service.registerValidator('test', null as any))
        .toThrow('Validator must be a function');
    });
    
    it('should remove a validator', () => {
      const validator = async () => {};
      service.registerValidator('custom-remove-test', validator);
      const validationServiceInstance = service as ValidationService;
      expect(validationServiceInstance.hasValidator('custom-remove-test')).toBe(true);
      service.removeValidator('custom-remove-test');
      expect(validationServiceInstance.hasValidator('custom-remove-test')).toBe(false);
    });
  });
  
  describe('Text directive validation', () => {
    it('should validate a valid text directive', async () => {
      const node = createTextDirective('greeting', 'Hello');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on missing name with Fatal severity', async () => {
      const node = createTextDirective('', 'Hello');
      await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'text', messageContains: 'identifier'
      });
    });
    
    it('should throw on missing value with Fatal severity', async () => {
        const node = createTextDirective('greeting', ''); // Empty value
        await expectToThrowWithConfig(async () => service.validate(node), {
            type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal, directiveKind: 'text', messageContains: 'Value cannot be empty' // Specific message
        });
    });
    
    it('should throw on invalid name format with Fatal severity', async () => {
      const node = createTextDirective('123invalid', 'Hello');
      await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'text', messageContains: 'identifier format'
      });
    });

    it('should validate a text directive with @embed value', async () => {
      const node = createTextDirective('instructions', '@embed [$./path.md]');
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a text directive with @embed value with section', async () => {
      const node = createTextDirective('instructions', '@embed [$./path.md#Section]'); // Corrected syntax
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a text directive with @run value', async () => {
      const node = createTextDirective('result', '@run [echo \"Hello\"]'); // Ensure quotes are handled
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a text directive with @run value with variables', async () => {
      const node = createTextDirective('result', '@run [oneshot \"What is {{status}}?\"]'); // Example with var
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on invalid @embed format (missing brackets)', async () => {
      const node = createTextDirective('instructions', '@embed path.md');
      await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'text', messageContains: 'embed format'
      });
    });

    it('should throw on invalid @run format (missing brackets)', async () => {
      const node = createTextDirective('result', '@run echo \"Hello\"');
      await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'text', messageContains: 'run format'
      });
    });
  });
  
  describe('Data directive validation', () => {
    it('should validate a valid data directive with string value', async () => {
      const node = createDataDirective('config', '{"key": "value"}');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate a valid data directive with object value', async () => {
      const node = createDataDirective('config', { key: 'value' });
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on invalid JSON string with Fatal severity', async () => {
      const node = createDataDirective('config', '{invalid json}');
      await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'data', messageContains: 'valid JSON'
      });
    });
    
    it('should throw on missing name with Fatal severity', async () => {
      const node = createDataDirective('', { key: 'value' });
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'data', messageContains: 'identifier'
      });
    });
    
    it('should throw on invalid name format with Fatal severity', async () => {
      const node = createDataDirective('123invalid', { key: 'value' });
      await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'data', messageContains: 'identifier format'
      });
    });
  });
  
  describe('Path directive validation', () => {
    it('should validate a valid path directive with $HOMEPATH', async () => {
      const node = createPathDirective('docs', '$HOMEPATH/docs');
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid path directive with $PROJECTPATH', async () => {
      const node = createPathDirective('src', '$PROJECTPATH/src');
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid path directive with $~', async () => {
      const node = createPathDirective('config', '$~/config');
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid path directive with $.', async () => {
      const node = createPathDirective('test', '$./test');
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on missing identifier with Fatal severity', async () => {
      const node = createPathDirective('', '$HOMEPATH/docs');
      await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'path', messageContains: 'identifier'
      });
    });

    it('should throw on invalid identifier format with Fatal severity', async () => {
      const node = createPathDirective('123invalid', '$HOMEPATH/docs');
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'path', messageContains: 'identifier format'
      });
    });

    it('should throw on missing path value with Fatal severity', async () => {
      const node = createPathDirective('docs', ''); // Empty value
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'path', messageContains: 'path value cannot be empty'
      });
    });

    it('should throw on whitespace path value with Fatal severity', async () => {
      const node = createPathDirective('docs', '   ');
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'path', messageContains: 'path value cannot be empty'
      });
    });
  });
  
  describe('Import directive validation', () => {
    it('should validate a valid import directive (simple path)', async () => {
      const node = createImportDirective('imports.meld');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate a valid import directive with from syntax without alias', async () => {
      // Need a node structure representing this syntax
       const node = makeDirectiveNode('import', '[role] from [imports.meld]', { path: 'imports.meld', imports: [{ name: 'role' }] });
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate a valid import directive with from syntax and alias', async () => {
      const node = makeDirectiveNode('import', '[role as roles] from [imports.meld]', { path: 'imports.meld', imports: [{ name: 'role', alias: 'roles' }] });
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    // This might change depending on parser strictness
    it('should currently allow empty alias when using as syntax', async () => {
       const node = makeDirectiveNode('import', '[role as] from [imports.meld]', { path: 'imports.meld', imports: [{ name: 'role', alias: '' }] });
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate structured imports using bracket notation without alias', async () => {
      const node = makeDirectiveNode('import', '[role] from [imports.meld]', { path: 'imports.meld', imports: [{ name: 'role' }] });
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate structured imports with multiple variables', async () => {
       const node = makeDirectiveNode('import', '[var1, var2 as alias2, var3] from [imports.meld]', {
           path: 'imports.meld',
           imports: [{ name: 'var1' }, { name: 'var2', alias: 'alias2' }, { name: 'var3' }]
       });
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on missing path with Fatal severity (simple form)', async () => {
      const node = createImportDirective(''); // Empty path
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'import', messageContains: 'path is required'
      });
    });

     it('should throw on missing path with Fatal severity (structured form)', async () => {
       const node = makeDirectiveNode('import', '[var1]', { imports: [{ name: 'var1' }] }); // Missing path
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'import', messageContains: 'path is required'
      });
    });

     it('should throw on missing import specifiers with Fatal severity (structured form)', async () => {
       const node = makeDirectiveNode('import', '[] from [path.meld]', { path: 'path.meld', imports: [] }); // Empty imports array
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'import', messageContains: 'Import specifiers cannot be empty'
      });
    });
  });
  
  describe('Embed directive validation', () => {
    it('should validate a valid embed directive with section', async () => {
      const node = createEmbedDirective('test.md', 'section');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate embed directive without section', async () => {
      const node = createEmbedDirective('test.md', undefined);
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on missing path with Fatal severity', async () => {
      const node = createEmbedDirective('', undefined);
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'embed', messageContains: 'path is required'
      });
    });
    
    it('should validate fuzzy matching threshold', async () => {
      const node = createEmbedDirective('test.md', 'section');
      // Manually add fuzzy property to the directive object
      if (node.directive) node.directive.fuzzy = 0.8; 
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on invalid fuzzy threshold (below 0) with Fatal severity', async () => {
      const node = createEmbedDirective('test.md', 'section');
      if (node.directive) node.directive.fuzzy = -0.1;
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'embed', messageContains: 'fuzzy threshold'
      });
    });
    
    it('should throw on invalid fuzzy threshold (above 1) with Fatal severity', async () => {
      const node = createEmbedDirective('test.md', 'section');
       if (node.directive) node.directive.fuzzy = 1.1;
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'embed', messageContains: 'fuzzy threshold'
      });
    });
  });
  
  describe('Unknown directive handling', () => {
    it('should throw on unknown directive kind with Fatal severity', async () => {
       const node = makeDirectiveNode('unknown', '');
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.HANDLER_NOT_FOUND,
          severity: ErrorSeverity.Fatal, directiveKind: 'unknown', messageContains: 'No validator registered'
      });
    });
  });
  
  describe('Error handling properties', () => {
    // Example: Test a known fatal validation error
    it('should identify fatal errors correctly (e.g., missing path in import)', async () => {
      const node = createImportDirective('');
      try {
        await service.validate(node);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError); 
        const meldError = error as MeldDirectiveError;
        // Check severity directly if available, or use canBeWarning()
        expect(meldError.severity).toBe(ErrorSeverity.Fatal);
        expect(meldError.canBeWarning()).toBe(false);
      }
    });
    
    // Example: Test a potentially recoverable error if one exists in validation
    // (Currently, most validation errors seem Fatal based on tests)
    // it('should identify recoverable errors correctly', async () => { ... });
  });
}); 
}); 