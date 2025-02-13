import type { DirectiveNode } from 'meld-spec';
import { validationLogger as logger } from '../../core/utils/logger';
import { IValidationService } from './IValidationService';
import { MeldDirectiveError } from '../../core/errors/MeldDirectiveError';

// Import default validators
import { validateTextDirective } from './validators/TextDirectiveValidator';
import { validateDataDirective } from './validators/DataDirectiveValidator';
import { validateImportDirective } from './validators/ImportDirectiveValidator';
import { validateEmbedDirective } from './validators/EmbedDirectiveValidator';

export class ValidationService implements IValidationService {
  private validators = new Map<string, (node: DirectiveNode) => void>();
  
  constructor() {
    // Register default validators
    this.registerValidator('text', validateTextDirective);
    this.registerValidator('data', validateDataDirective);
    this.registerValidator('import', validateImportDirective);
    this.registerValidator('embed', validateEmbedDirective);
    
    logger.debug('ValidationService initialized with default validators', {
      validators: Array.from(this.validators.keys())
    });
  }
  
  validate(node: DirectiveNode): void {
    logger.debug('Validating directive', {
      kind: node.directive.kind,
      location: node.location
    });
    
    const validator = this.validators.get(node.directive.kind);
    if (!validator) {
      throw new MeldDirectiveError(
        `Unknown directive kind: ${node.directive.kind}`,
        node.directive.kind,
        node.location?.start
      );
    }
    
    try {
      validator(node);
      logger.debug('Directive validation successful', {
        kind: node.directive.kind,
        location: node.location
      });
    } catch (error) {
      logger.error('Directive validation failed', {
        kind: node.directive.kind,
        location: node.location,
        error
      });
      throw error;
    }
  }
  
  registerValidator(kind: string, validator: (node: DirectiveNode) => void): void {
    if (!kind || typeof kind !== 'string') {
      throw new Error('Validator kind must be a non-empty string');
    }
    if (typeof validator !== 'function') {
      throw new Error('Validator must be a function');
    }
    
    this.validators.set(kind, validator);
    logger.debug('Registered validator', { kind });
  }
  
  removeValidator(kind: string): void {
    if (this.validators.delete(kind)) {
      logger.debug('Removed validator', { kind });
    }
  }
  
  hasValidator(kind: string): boolean {
    return this.validators.has(kind);
  }
  
  getRegisteredDirectiveKinds(): string[] {
    return Array.from(this.validators.keys());
  }
} 