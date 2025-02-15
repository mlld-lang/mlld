import type { DirectiveNode } from 'meld-spec';

export interface IValidationService {
  /**
   * Validate a directive node against its schema and constraints
   * @throws {MeldDirectiveError} If validation fails
   */
  validate(node: DirectiveNode): Promise<void>;
  
  /**
   * Register a validator function for a specific directive kind
   */
  registerValidator(kind: string, validator: (node: DirectiveNode) => Promise<void>): void;
  
  /**
   * Remove a validator for a specific directive kind
   */
  removeValidator(kind: string): void;
  
  /**
   * Check if a validator exists for a specific directive kind
   */
  hasValidator(kind: string): boolean;
  
  /**
   * Get all registered directive kinds that can be validated
   */
  getRegisteredDirectiveKinds(): string[];
} 