import type { DirectiveNode } from 'meld-spec';
import { validationLogger as logger } from '@core/utils/logger.js';
import { IValidationService } from './IValidationService.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

// Import default validators
import { validateTextDirective } from './validators/TextDirectiveValidator.js';
import { validateDataDirective } from './validators/DataDirectiveValidator.js';
import { validateImportDirective } from './validators/ImportDirectiveValidator.js';
import { validateEmbedDirective } from './validators/EmbedDirectiveValidator.js';
import { validatePathDirective } from './validators/PathDirectiveValidator.js';
import { validateDefineDirective } from './validators/DefineDirectiveValidator.js';
import { validateRunDirective } from './validators/RunDirectiveValidator.js';

export class ValidationService implements IValidationService {
  private validators = new Map<string, (node: DirectiveNode) => Promise<void>>();
  
  constructor() {
    // Register default validators
    this.registerValidator('text', async (node) => validateTextDirective(node));
    this.registerValidator('data', async (node) => validateDataDirective(node));
    this.registerValidator('import', async (node) => validateImportDirective(node));
    this.registerValidator('embed', async (node) => validateEmbedDirective(node));
    this.registerValidator('path', async (node) => validatePathDirective(node));
    this.registerValidator('define', async (node) => validateDefineDirective(node));
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
    logger.debug('Validating directive', {
      kind: node.directive.kind,
      location: node.location
    });
    
    const validator = this.validators.get(node.directive.kind);
    if (!validator) {
      throw new MeldDirectiveError(
        `Unknown directive kind: ${node.directive.kind}`,
        node.directive.kind,
        {
          location: node.location?.start,
          code: DirectiveErrorCode.HANDLER_NOT_FOUND,
          severity: ErrorSeverity.Fatal // Unknown directives are fatal errors
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
      
      // Otherwise, wrap it in a MeldDirectiveError
      throw new MeldDirectiveError(
        error instanceof Error ? error.message : String(error),
        node.directive.kind,
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          cause: error instanceof Error ? error : undefined,
          severity: ErrorSeverity.Recoverable // Most validation errors are recoverable
        }
      );
    }
    
    logger.debug('Directive validation successful', {
      kind: node.directive.kind
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