/**
 * Validation extension patterns
 */
import { MeldNode } from '@core/types/nodes';
import { Result } from '@core/types/common';
import { ProcessingContext } from '@core/types/services/context';

/**
 * Validation result for a node
 */
export interface ValidationResult {
  /** Whether the node is valid */
  valid: boolean;
  
  /** Validation errors */
  errors: ValidationError[];
  
  /** Validation warnings */
  warnings: ValidationWarning[];
}

/**
 * Validation error information
 */
export interface ValidationError {
  /** Error code */
  code: string;
  
  /** Error message */
  message: string;
  
  /** Path to the error in the node */
  path?: string;
  
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Validation warning information
 */
export interface ValidationWarning {
  /** Warning code */
  code: string;
  
  /** Warning message */
  message: string;
  
  /** Path to the warning in the node */
  path?: string;
  
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Extension interface for validation
 */
export interface IValidationExtension {
  /** Validate a node */
  validate(node: MeldNode, context: ProcessingContext): Promise<Result<ValidationResult>>;
  
  /** Register custom validators */
  registerValidator(nodeType: string, validator: NodeValidator): void;
  
  /** Get registered validators */
  getValidators(): Map<string, NodeValidator[]>;
}

/**
 * Node validator function
 */
export type NodeValidator = (node: MeldNode, context: ProcessingContext) => Promise<ValidationResult>;