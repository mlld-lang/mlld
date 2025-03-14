import type { DirectiveNode } from '@core/syntax/types';

/**
 * Service responsible for validating directive nodes against schemas and constraints.
 * Provides a registry of validators for different directive kinds.
 * 
 * @remarks
 * The ValidationService manages a registry of directive validators and coordinates
 * validation operations. Each directive kind (text, path, data, import, etc.) has
 * specific validation rules that are enforced by specialized validators.
 * 
 * This service is used primarily by the DirectiveService before executing directives
 * to ensure they have valid syntax and semantics. It provides a pluggable validation
 * system that can be extended with custom validators.
 * 
 * Dependencies:
 * - None directly, though validators may depend on other services
 */
export interface IValidationService {
  /**
   * Validate a directive node against its schema and constraints.
   * 
   * @param node - The directive node to validate
   * @throws {MeldDirectiveError} If validation fails with specific validation errors
   * 
   * @example
   * ```ts
   * try {
   *   await validationService.validate({
   *     type: 'Directive',
   *     kind: 'text',
   *     name: 'greeting',
   *     value: 'Hello, world!'
   *   });
   *   console.log('Directive is valid');
   * } catch (error) {
   *   console.error(`Validation error: ${error.message}`);
   * }
   * ```
   */
  validate(node: DirectiveNode): Promise<void>;
  
  /**
   * Register a validator function for a specific directive kind.
   * 
   * @param kind - The directive kind to register a validator for
   * @param validator - The validator function that performs validation
   * @throws {MeldError} If a validator for this kind already exists
   * 
   * @example
   * ```ts
   * validationService.registerValidator('custom', async (node) => {
   *   if (!node.name) {
   *     throw new MeldDirectiveError('Custom directive requires a name', node);
   *   }
   * });
   * ```
   */
  registerValidator(kind: string, validator: (node: DirectiveNode) => Promise<void>): void;
  
  /**
   * Remove a validator for a specific directive kind.
   * 
   * @param kind - The directive kind to remove the validator for
   */
  removeValidator(kind: string): void;
  
  /**
   * Check if a validator exists for a specific directive kind.
   * 
   * @param kind - The directive kind to check for a validator
   * @returns true if a validator exists for the specified kind, false otherwise
   */
  hasValidator(kind: string): boolean;
  
  /**
   * Get all registered directive kinds that can be validated.
   * 
   * @returns An array of directive kinds that have registered validators
   * 
   * @example
   * ```ts
   * const supportedDirectives = validationService.getRegisteredDirectiveKinds();
   * console.log(`Supported directives: ${supportedDirectives.join(', ')}`);
   * ```
   */
  getRegisteredDirectiveKinds(): string[];
} 