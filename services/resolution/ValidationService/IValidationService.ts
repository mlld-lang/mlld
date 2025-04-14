import type { DirectiveNode } from '@core/syntax/types/index.js';
import type { ValidationServiceLike } from '@core/shared-service-types.js';

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
interface IValidationService extends ValidationServiceLike {
  /**
   * Validate a directive node against the registered validator for its kind.
   * 
   * @param node - The directive node to validate
   * @throws {MeldDirectiveError} If validation fails
   * @throws {MeldError} If no validator is registered for the node's kind
   * 
   * @example
   * ```ts
   * try {
   *   await validationService.validate(directiveNode);
   * } catch (error) {
   *   logger.error(`Validation failed: ${error.message}`);
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

export type { IValidationService }; 