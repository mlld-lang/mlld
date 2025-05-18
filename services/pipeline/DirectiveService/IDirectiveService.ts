import { DirectiveNode, SourceLocation } from '@core/ast/types/index';
import type { 
  ParserServiceLike,
  CircularityServiceLike,
} from '@core/shared-service-types';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { ResolutionContext } from '@core/types/resolution';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { DirectiveResult } from '@core/directives/DirectiveHandler.ts';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';

/**
 * Interface for directive handlers
 */
export interface IDirectiveHandler {
  /** The directive kind this handler processes */
  readonly kind: string;

  /**
   * Handle the directive processing
   * 
   * @param context - The processing context containing state, resolution context, node, etc.
   * @returns A DirectiveResult containing state changes and optional replacement nodes.
   * @throws {MeldDirectiveError} If directive handling fails
   */
  handle(
    context: DirectiveProcessingContext
  ): Promise<DirectiveResult>;
}

/**
 * Service responsible for handling Meld directives in the processing pipeline.
 * Orchestrates directive validation, execution, and transformation.
 * 
 * @remarks
 * The DirectiveService acts as the core orchestrator for directive processing.
 * It maintains a registry of directive handlers, validates directive syntax and
 * semantics, and routes directives to the appropriate handler for execution.
 * 
 * This service is central to the Meld pipeline and interacts with nearly all
 * other services to process directives effectively.
 * 
 * Dependencies:
 * - ValidationServiceLike: For directive syntax and semantic validation
 * - StateServiceLike: For maintaining state during directive execution
 * - PathServiceLike: For path resolution in file-related directives
 * - FileSystemLike: For file operations in import and other directives
 * - ParserServiceLike: For parsing content in imports and fragments
 * - CircularityServiceLike: For detecting circular imports and references
 * - ResolutionServiceLike: For variable resolution in directive content
 */
export interface IDirectiveService {
  /**
   * Initialize the DirectiveService with required dependencies
   * 
   * @param validationService - Service for validating directive syntax and semantics
   * @param stateService - Service for maintaining state during execution
   * @param pathService - Service for path resolution
   * @param fileSystemService - Service for file operations
   * @param parserService - Service for parsing content
   * @param interpreterServiceClientFactory - Factory for creating interpreter service clients
   * @param circularityService - Service for detecting circular references
   * @param resolutionService - Service for variable resolution
   */
  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: ParserServiceLike,
    interpreterServiceClientFactory: any,
    circularityService: CircularityServiceLike,
    resolutionService: IResolutionService
  ): void;

  /**
   * Update the interpreter service reference
   * This is needed to handle circular dependencies in initialization
   * 
   * @param interpreterService - The interpreter service to use
   * @deprecated Use interpreterServiceClientFactory instead
   */
  updateInterpreterService(interpreterService: any): void;

  /**
   * Handle a directive node
   * Uses the new DirectiveProcessingContext.
   */
  handleDirective(
    node: DirectiveNode,
    context: DirectiveProcessingContext
  ): Promise<DirectiveResult>;

  /**
   * Register a new directive handler
   * 
   * @param handler - The handler to register
   * @throws {MeldServiceError} If a handler for the directive kind already exists
   */
  registerHandler(handler: IDirectiveHandler): void;

  /**
   * Check if a handler exists for a directive kind
   * 
   * @param kind - The directive kind to check
   * @returns true if a handler exists, false otherwise
   */
  hasHandler(kind: string): boolean;

  /**
   * Validate a directive node
   * 
   * @param node - The directive node to validate
   * @throws {MeldDirectiveError} If validation fails
   */
  validateDirective(node: DirectiveNode): Promise<void>;

  /**
   * Create a child context for nested directives
   * 
   * @param parentContext - The parent execution context
   * @param filePath - The file path for the child context
   * @returns A new directive context with a child state
   */
  createChildContext(
    parentContext: DirectiveProcessingContext,
    filePath: string
  ): DirectiveProcessingContext;

  /**
   * Process a directive node, validating and executing it
   * Values in the directive will already be interpolated by meld-ast
   * 
   * @param node - The directive node to process
   * @param parentContext - Optional parent context for nested directives
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive processing fails
   * 
   * @example
   * ```ts
   * const node = {
   *   type: 'Directive',
   *   kind: 'text',
   *   name: 'greeting',
   *   value: 'Hello, world!',
   *   // ... other properties
   * };
   * const state = await directiveService.processDirective(node);
   * ```
   */
  processDirective(
    node: DirectiveNode,
    parentContext?: DirectiveProcessingContext
  ): Promise<IStateService>;

  /**
   * Process multiple directive nodes in sequence
   * 
   * @param nodes - The directive nodes to process
   * @param parentContext - Optional parent context for nested directives
   * @returns The final state after processing all directives
   * @throws {MeldDirectiveError} If any directive processing fails
   */
  processDirectives(
    nodes: DirectiveNode[],
    parentContext?: DirectiveProcessingContext
  ): Promise<IStateService>;

  /**
   * Check if a directive kind is supported
   * 
   * @param kind - The directive kind to check
   * @returns true if the directive kind is supported, false otherwise
   */
  supportsDirective(kind: string): boolean;

  /**
   * Get a list of all supported directive kinds
   * 
   * @returns An array of supported directive kinds
   */
  getSupportedDirectives(): string[];
} 