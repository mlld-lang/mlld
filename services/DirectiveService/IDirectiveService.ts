import { DirectiveNode } from 'meld-spec';
import { IStateService } from '../StateService/IStateService';
import type { IValidationService } from '../ValidationService/IValidationService';
import type { IPathService } from '../PathService/IPathService';
import type { IFileSystemService } from '../FileSystemService/IFileSystemService';
import type { IParserService } from '../ParserService/IParserService';
import type { IInterpreterService } from '../InterpreterService/IInterpreterService';
import type { ICircularityService } from '../CircularityService/ICircularityService';
import type { IResolutionService } from '../ResolutionService/IResolutionService';

/**
 * Context for directive execution
 */
export interface DirectiveContext {
  /** Current file being processed */
  currentFilePath?: string;
  /** Parent state for nested contexts */
  parentState?: IStateService;
}

/**
 * Interface for directive handlers
 */
export interface IDirectiveHandler {
  /** The directive kind this handler processes */
  readonly kind: string;

  /**
   * Execute the directive
   */
  execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<void>;
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
   * Handle a directive node
   */
  handleDirective(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<void>;

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
   * @throws {MeldDirectiveError} If directive processing fails
   */
  processDirective(node: DirectiveNode): Promise<void>;

  /**
   * Process multiple directive nodes in sequence
   * @throws {MeldDirectiveError} If any directive processing fails
   */
  processDirectives(nodes: DirectiveNode[]): Promise<void>;

  /**
   * Check if a directive kind is supported
   */
  supportsDirective(kind: string): boolean;

  /**
   * Get a list of all supported directive kinds
   */
  getSupportedDirectives(): string[];
} 