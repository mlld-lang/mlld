import { DirectiveNode } from 'meld-spec';
import { IStateService } from '@services/StateService/IStateService.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IPathService } from '@services/PathService/IPathService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import type { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';

/**
 * Context for directive execution
 */
export interface DirectiveContext {
  /** Current file being processed */
  currentFilePath?: string;
  /** Parent state for nested contexts */
  parentState?: IStateService;
  /** Current state for this directive */
  state: IStateService;
  /** Working directory for command execution */
  workingDirectory?: string;
}

/**
 * Interface for directive handlers
 */
export interface IDirectiveHandler {
  /** The directive kind this handler processes */
  readonly kind: string;

  /**
   * Execute the directive
   * @returns The updated state after directive execution
   */
  execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<IStateService>;
}

/**
 * Service responsible for handling directives
 */
export interface IDirectiveService {
  /**
   * Initialize the DirectiveService with required dependencies
   */
  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: IParserService,
    interpreterService: IInterpreterService,
    circularityService: ICircularityService,
    resolutionService: IResolutionService
  ): void;

  /**
   * Update the interpreter service reference
   * This is needed to handle circular dependencies in initialization
   */
  updateInterpreterService(interpreterService: IInterpreterService): void;

  /**
   * Handle a directive node
   * @returns The updated state after directive execution
   */
  handleDirective(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<IStateService>;

  /**
   * Register a new directive handler
   */
  registerHandler(handler: IDirectiveHandler): void;

  /**
   * Check if a handler exists for a directive kind
   */
  hasHandler(kind: string): boolean;

  /**
   * Validate a directive node
   */
  validateDirective(node: DirectiveNode): Promise<void>;

  /**
   * Create a child context for nested directives
   */
  createChildContext(
    parentContext: DirectiveContext,
    filePath: string
  ): DirectiveContext;

  /**
   * Process a directive node, validating and executing it
   * Values in the directive will already be interpolated by meld-ast
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive processing fails
   */
  processDirective(node: DirectiveNode, parentContext?: DirectiveContext): Promise<IStateService>;

  /**
   * Process multiple directive nodes in sequence
   * @returns The final state after processing all directives
   * @throws {MeldDirectiveError} If any directive processing fails
   */
  processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveContext): Promise<IStateService>;

  /**
   * Check if a directive kind is supported
   */
  supportsDirective(kind: string): boolean;

  /**
   * Get a list of all supported directive kinds
   */
  getSupportedDirectives(): string[];
} 