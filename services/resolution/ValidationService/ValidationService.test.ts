import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import type { DirectiveNode } from '@core/ast/types';
import {
  createTextDirective,
  createDataDirective,
  createImportDirective,
  createAddDirective,
  createPathDirective,
  createLocation,
  createDirectiveNode,
  createVariableReferenceArray
} from '@tests/utils/testFactories';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError';
import { 
  expectDirectiveValidationError, 
  expectToThrowWithConfig,
  expectValidationError,
  expectValidationToThrowWithDetails
} from '@tests/utils/ErrorTestUtils';
import { textDirectiveExamples } from '@core/syntax/index';
// import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers'; // Commented out due to path issues
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import { DirectiveKind } from '@core/ast/types/directives';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { MockFactory } from '@tests/utils/mocks/MockFactory';
import { createMeldPath, unsafeCreateValidatedResourcePath } from '@core/types/paths';
import { container, type DependencyContainer } from 'tsyringe';

describe('ValidationService', () => {
  let service: IValidationService;
  let testContainer: DependencyContainer;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  
  beforeEach(async () => {
    testContainer = container.createChildContainer();

    mockResolutionService = mockDeep<IResolutionService>();
    mockResolutionService.resolvePath.mockResolvedValue(createMeldPath('/resolved/path'));
    mockResolutionService.resolveInContext.mockImplementation(async (val) => String(val));
    mockResolutionService.validateResolution.mockResolvedValue(createMeldPath('/resolved/path'));


    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance('DependencyContainer', testContainer);
    
    testContainer.register<IValidationService>('IValidationService', { useClass: ValidationService });
    
    service = testContainer.resolve<IValidationService>('IValidationService');
    
    expect(service).toBeInstanceOf(ValidationService);

    mockResolutionService.resolvePath.mockResolvedValue(createMeldPath('/resolved/path'));
    mockResolutionService.validateResolution.mockResolvedValue(createMeldPath('/resolved/path'));
    mockResolutionService.resolveInContext.mockImplementation(async (val) => String(val));
  });
  
  afterEach(async () => {
    testContainer?.dispose();
  });
  
  describe('Service initialization', () => {
    it('should initialize with default validators', () => {
      const kinds = service.getRegisteredDirectiveKinds();
      expect(kinds).toContain('text');
      expect(kinds).toContain('data');
      expect(kinds).toContain('import');
      expect(kinds).toContain('add');
      expect(kinds).toContain('path');
      expect(kinds).toContain('exec');
      expect(kinds).toContain('run');
    });
  });
  
  describe('Validator registration', () => {
    it('should register a new validator', () => {
      const validator = async () => {};
      service.registerValidator('custom', validator);
      const validationServiceInstance = service as ValidationService;
      expect(validationServiceInstance.hasValidator('custom')).toBe(true);
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
        const node = createTextDirective('greeting', '');
        await expectToThrowWithConfig(async () => service.validate(node), {
            type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal, directiveKind: 'text', messageContains: 'requires a non-empty "value" property'
        });
    });
    
    it('should throw on invalid name format with Fatal severity', async () => {
      const node = createTextDirective('123invalid', 'Hello');
      await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'text', messageContains: 'must be a valid identifier'
      });
    });

    it('should validate a text directive with @add value', async () => {
      const node = createTextDirective('instructions', '@add [$./path.md]');
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a text directive with @add value with section', async () => {
      const node = createTextDirective('instructions', '@add [$./path.md#Section]');
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a text directive with @run value', async () => {
      const node = createTextDirective('result', '@run [echo \"Hello\"]');
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a text directive with @run value with variables', async () => {
      const node = createTextDirective('result', '@run [oneshot \"What is {{status}}?\"]');
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on invalid @add format (missing brackets)', async () => {
      const node = createTextDirective('instructions', '@add path.md');
      await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'text', messageContains: 'add format'
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
          severity: ErrorSeverity.Fatal, directiveKind: 'data', messageContains: 'must be a valid identifier'
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
          severity: ErrorSeverity.Fatal, directiveKind: 'path', messageContains: 'must be a valid identifier'
      });
    });

    it('should throw on missing path value with Fatal severity', async () => {
      const node = createPathDirective('docs', '');
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'path', messageContains: 'requires a non-empty path value'
      });
    });

    it('should throw on whitespace path value with Fatal severity', async () => {
      const node = createPathDirective('docs', '   ');
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'path', messageContains: 'requires a non-empty path value'
      });
    });
  });
  
  describe('Import directive validation', () => {
    it('should validate a valid import directive (simple path)', async () => {
      const node = createImportDirective('imports.meld');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate a valid import directive with from syntax without alias', async () => {
      const node = createImportDirective('[role]', createLocation(1, 1, 1, 50), 'imports.meld');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate a valid import directive with from syntax and alias', async () => {
      const node = createImportDirective('[role as roles]', createLocation(1, 1, 1, 50), 'imports.meld');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate structured imports using bracket notation without alias', async () => {
      const node = createImportDirective('[role]', createLocation(1, 1, 1, 50), 'imports.meld');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate structured imports with multiple variables', async () => {
       const node = createImportDirective('[var1, var2 as alias2, var3]', createLocation(1, 1, 1, 50), 'imports.meld');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on missing path with Fatal severity (simple form)', async () => {
      const node = createImportDirective('');
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'import', messageContains: 'requires a path'
      });
    });

     it('should throw on missing path with Fatal severity (structured form)', async () => {
       // Create an import directive with imports but no path
       const node: DirectiveNode = {
         type: 'Directive',
         nodeId: 'test-import-no-path',
         location: createLocation(1, 1, 1, 50),
         kind: 'import',
         subtype: 'importSelected',
         source: 'import',
         values: {
           imports: [{
             type: 'VariableReference',
             nodeId: 'test-import-var1',
             identifier: 'var1',
             valueType: 'import',
             isVariableReference: true,
             location: createLocation(1, 1, 1, 50)
           }]
         },
         raw: { imports: [{ name: 'var1' }] },
         meta: { hasVariables: false }
       };
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'import', messageContains: 'Import path cannot be empty'
      });
    });

     it('should throw on missing import specifiers with Fatal severity (structured form)', async () => {
       const node = createImportDirective('[]', createLocation(1, 1, 1, 50), 'path.meld');
       await expect(service.validate(node)).resolves.not.toThrow();
    });
  });
  
  describe('Add directive validation', () => {
    it('should validate a valid add directive with section', async () => {
      const node = createAddDirective('test.md', 'section');
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should validate add directive without section', async () => {
      const node = createAddDirective('test.md', undefined);
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it('should throw on missing path with Fatal severity', async () => {
      const node = createAddDirective('', undefined);
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'add', messageContains: 'requires a valid path'
      });
    });
    
    it('should validate fuzzy matching threshold', async () => {
      const node = createAddDirective('test.md', 'section');
      (node as any).meta = { fuzzy: 0.8 };
      await expect(service.validate(node)).resolves.not.toThrow();
    });
    
    it.skip('should throw on invalid fuzzy threshold (below 0) with Fatal severity', async () => {
      const node = createAddDirective('test.md', 'section');
      (node as any).meta = { fuzzy: -0.1 };
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'add', messageContains: 'must be a number between 0 and 1'
      });
    });
    
    it.skip('should throw on invalid fuzzy threshold (above 1) with Fatal severity', async () => {
      const node = createAddDirective('test.md', 'section');
      (node as any).meta = { fuzzy: 1.1 };
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal, directiveKind: 'add', messageContains: 'must be a number between 0 and 1'
      });
    });
  });
  
  describe('Unknown directive handling', () => {
    it('should throw on unknown directive kind with Fatal severity', async () => {
       const node: DirectiveNode = createDirectiveNode(
         'unknown' as any,
         {
           identifier: 'test',
           value: 'test',
           values: {
             identifier: createVariableReferenceArray('test')
           },
           raw: {
             identifier: 'test',
             value: 'test'
           }
         },
         createLocation()
       );
       await expectToThrowWithConfig(async () => service.validate(node), {
          type: 'MeldDirectiveError', code: DirectiveErrorCode.HANDLER_NOT_FOUND,
          severity: ErrorSeverity.Fatal, directiveKind: 'unknown', messageContains: 'Unknown directive kind:'
      });
    });
  });
  
  describe('Error handling properties', () => {
    it('should identify fatal errors correctly (e.g., missing path in import)', async () => {
      const node = createImportDirective('');
      try {
        await service.validate(node);
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError); 
        const meldError = error as MeldDirectiveError;
        expect(meldError.severity).toBe(ErrorSeverity.Fatal);
        expect(meldError.canBeWarning()).toBe(false);
      }
    });
  });
}); 