import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '../StateService/IStateService';
import type { IValidationService } from '../ValidationService/IValidationService';
import type { IPathService } from '../PathService/IPathService';
import type { IFileSystemService } from '../FileSystemService/IFileSystemService';
import type { IParserService } from '../ParserService/IParserService';
import type { IInterpreterService } from '../InterpreterService/IInterpreterService';
import type { ICircularityService } from '../CircularityService/ICircularityService';

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
    circularityService: ICircularityService
  ): void;

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