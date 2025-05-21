import type { DirectiveNode } from '@core/ast/types/index';
import { validationLogger as logger } from '@core/utils/logger';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';
import { Service } from '@core/ServiceProvider';
import { injectable } from 'tsyringe';

// Import default validators
import { validateTextDirective } from '@services/resolution/ValidationService/validators/TextDirectiveValidator';
import { validateDataDirective } from '@services/resolution/ValidationService/validators/DataDirectiveValidator';
import { validateImportDirective } from '@services/resolution/ValidationService/validators/ImportDirectiveValidator';
import { validateAddDirective } from '@services/resolution/ValidationService/validators/AddDirectiveValidator';
import { validatePathDirective } from '@services/resolution/ValidationService/validators/PathDirectiveValidator';
import { validateExecDirective } from '@services/resolution/ValidationService/validators/ExecDirectiveValidator';
import { validateRunDirective } from '@services/resolution/ValidationService/validators/RunDirectiveValidator';

/**
 * Map of directive error codes to severity levels
 */
export const ValidationErrorSeverity: Record<DirectiveErrorCode, ErrorSeverity> = {
  [DirectiveErrorCode.VALIDATION_FAILED]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.RESOLUTION_FAILED]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.EXECUTION_FAILED]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.HANDLER_NOT_FOUND]: ErrorSeverity.Fatal,
  [DirectiveErrorCode.FILE_NOT_FOUND]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.CIRCULAR_REFERENCE]: ErrorSeverity.Fatal,
  [DirectiveErrorCode.VARIABLE_NOT_FOUND]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.STATE_ERROR]: ErrorSeverity.Fatal,
  [DirectiveErrorCode.INVALID_CONTEXT]: ErrorSeverity.Fatal,
  [DirectiveErrorCode.SECTION_NOT_FOUND]: ErrorSeverity.Recoverable
};

@injectable()
@Service({
  description: 'Service responsible for validating directives against their schemas'
})
export class ValidationService implements IValidationService {
  private validators = new Map<string, (node: DirectiveNode) => Promise<void>>();
  
  constructor() {
    // Register default validators
    this.registerValidator('text', async (node) => validateTextDirective(node));
    this.registerValidator('data', async (node) => validateDataDirective(node));
    this.registerValidator('import', async (node) => validateImportDirective(node));
    this.registerValidator('add', async (node) => validateAddDirective(node));
    this.registerValidator('path', async (node) => validatePathDirective(node));
    this.registerValidator('exec', async (node) => validateExecDirective(node));
    this.registerValidator('run', async (node) => validateRunDirective(node));
    
    logger.debug('ValidationService initialized with default validators', {
      validators: Array.from(this.validators.keys())
    });
  }
  
  /**
   * Validate a directive node against its schema and constraints
   * @throws {MeldDirectiveError} If validation fails
   */
  async validate(node: DirectiveNode): Promise<void> {
    // Get the directive kind
    const kind = node.kind;
    
    logger.debug('Validating directive', {
      kind: kind,
      location: node.location
    });
    
    const validator = this.validators.get(kind);
    if (!validator) {
      throw new MeldDirectiveError(
        `Unknown directive kind: ${kind}`,
        kind,
        {
          location: node.location?.start,
          code: DirectiveErrorCode.HANDLER_NOT_FOUND,
          severity: ValidationErrorSeverity[DirectiveErrorCode.HANDLER_NOT_FOUND]
        }
      );
    }
    
    try {
      await validator(node);
    } catch (error) {
      // If it's already a MeldDirectiveError, just rethrow it
      if (error instanceof MeldDirectiveError) {
        throw error;
      }
      
      // Determine the error code and severity
      let code = DirectiveErrorCode.VALIDATION_FAILED;
      let severity = ValidationErrorSeverity[code];
      
      // Check for specific error messages to classify them
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('required') || errorMessage.includes('missing')) {
        // Missing required fields are recoverable
        code = DirectiveErrorCode.VALIDATION_FAILED;
        severity = ValidationErrorSeverity[code];
      } else if (errorMessage.includes('invalid format') || errorMessage.includes('must be')) {
        // Format validation errors are recoverable
        code = DirectiveErrorCode.VALIDATION_FAILED;
        severity = ValidationErrorSeverity[code];
      } else if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        // Not found errors are recoverable
        code = DirectiveErrorCode.FILE_NOT_FOUND;
        severity = ValidationErrorSeverity[code];
      } else if (errorMessage.includes('circular')) {
        // Circular reference errors are fatal
        code = DirectiveErrorCode.CIRCULAR_REFERENCE;
        severity = ValidationErrorSeverity[code];
      }
      
      // Otherwise, wrap it in a MeldDirectiveError
      throw new MeldDirectiveError(
        errorMessage,
        node.kind,
        {
          location: node.location?.start,
          code,
          cause: error instanceof Error ? error : undefined,
          severity
        }
      );
    }
    
    logger.debug('Directive validation successful', {
      kind: node.kind
    });
  }
  
  /**
   * Register a validator for a directive kind
   */
  registerValidator(kind: string, validator: (node: DirectiveNode) => Promise<void>): void {
    if (!kind || typeof kind !== 'string') {
      throw new Error('Validator kind must be a non-empty string');
    }
    if (typeof validator !== 'function') {
      throw new Error('Validator must be a function');
    }
    
    if (this.validators.has(kind)) {
      logger.warn(`Overriding existing validator for directive kind: ${kind}`);
    }
    
    this.validators.set(kind, validator);
    logger.debug(`Registered validator for directive kind: ${kind}`);
  }
  
  /**
   * Remove a validator for a directive kind
   */
  removeValidator(kind: string): void {
    this.validators.delete(kind);
    logger.debug(`Removed validator for directive kind: ${kind}`);
  }
  
  /**
   * Check if a validator exists for a directive kind
   */
  hasValidator(kind: string): boolean {
    return this.validators.has(kind);
  }
  
  /**
   * Get all registered directive kinds
   */
  getRegisteredDirectiveKinds(): string[] {
    return Array.from(this.validators.keys());
  }
} 