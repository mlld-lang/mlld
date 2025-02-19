import { DirectiveNode } from 'meld-spec';
import type { DirectiveContext, IDirectiveHandler } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

// Define the ImportDirective interface
interface ImportDirective {
  kind: 'import';
  identifier: string;
  value: string;
}

/**
 * Handler for @import directives
 * Imports variables from other files
 */
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private circularityService: ICircularityService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing import directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get path and import list from directive
      const { path, importList } = node.directive;

      // 3. Process path
      if (!path) {
        throw new DirectiveError(
          'Import directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        state: context.state,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        }
      };

      // Resolve variables in path
      const resolvedPath = await this.resolutionService.resolveInContext(
        path,
        resolutionContext
      );

      // Check for circular imports
      this.circularityService.beginImport(resolvedPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedPath)) {
          throw new DirectiveError(
            `Import file not found: ${resolvedPath}`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { node, context }
          );
        }

        // Read file content
        const content = await this.fileSystemService.readFile(resolvedPath);
        if (!content) {
          throw new DirectiveError(
            `Empty or invalid import file: ${resolvedPath}`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            { node, context }
          );
        }

        // Parse content
        const nodes = await this.parserService.parse(content);

        // Create child state for interpretation
        const childState = newState.createChildState();

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedPath,
          mergeState: true
        });

        // Parse import list
        const imports = await this.parseImportList(importList || '*');

        // Import variables based on list
        for (const { identifier, alias } of imports) {
          if (identifier === '*') {
            // Import all variables
            this.importAllVariables(interpretedState, newState);
          } else {
            // Import specific variable
            this.importVariable(identifier, alias, interpretedState, newState);
          }
        }

        logger.debug('Import directive processed successfully', {
          path: resolvedPath,
          imports,
          location: node.location
        });

        return newState;
      } finally {
        // Always end import tracking
        this.circularityService.endImport(resolvedPath);
      }
    } catch (error: any) {
      logger.error('Failed to process import directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }

  /**
   * Parse import list from string
   */
  private async parseImportList(importList: string): Promise<Array<{ identifier: string; alias?: string }>> {
    if (importList === '*') {
      return [{ identifier: '*' }];
    }

    // Create a mock import directive to parse the list
    const mockContent = `@import [${importList}] from [file.md]`;
    
    try {
      // Parse the mock content
      const nodes = await this.parserService.parse(mockContent);
      
      if (!nodes || nodes.length === 0 || nodes[0].type !== 'Directive' || nodes[0].directive.kind !== 'import') {
        throw new DirectiveError(
          'Failed to parse import list',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED
        );
      }

      const importNode = nodes[0] as DirectiveNode;
      const importItems = importNode.directive.imports || [];

      return importItems.map(item => ({
        identifier: item.name,
        alias: item.alias
      }));
    } catch (error) {
      // If parsing fails, it's an invalid import syntax
      throw new DirectiveError(
        `Invalid import syntax: ${importList}`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { cause: error instanceof Error ? error : new Error(String(error)) }
      );
    }
  }

  /**
   * Import all variables from source state to target state
   */
  private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
    // Import text variables
    for (const [key, value] of sourceState.getAllTextVars()) {
      targetState.setTextVar(key, value);
    }

    // Import data variables
    for (const [key, value] of sourceState.getAllDataVars()) {
      targetState.setDataVar(key, value);
    }

    // Import path variables
    for (const [key, value] of sourceState.getAllPathVars()) {
      targetState.setPathVar(key, value);
    }

    // Import commands
    for (const [key, value] of sourceState.getAllCommands()) {
      targetState.setCommand(key, value);
    }
  }

  /**
   * Import a specific variable from source state to target state
   */
  private importVariable(
    identifier: string,
    alias: string | undefined,
    sourceState: IStateService,
    targetState: IStateService
  ): void {
    // Try to find variable in each type
    const textVar = sourceState.getTextVar(identifier);
    if (textVar !== undefined) {
      targetState.setTextVar(alias || identifier, textVar);
      return;
    }

    const dataVar = sourceState.getDataVar(identifier);
    if (dataVar !== undefined) {
      targetState.setDataVar(alias || identifier, dataVar);
      return;
    }

    const pathVar = sourceState.getPathVar(identifier);
    if (pathVar !== undefined) {
      targetState.setPathVar(alias || identifier, pathVar);
      return;
    }

    const command = sourceState.getCommand(identifier);
    if (command !== undefined) {
      targetState.setCommand(alias || identifier, command);
      return;
    }

    throw new DirectiveError(
      `Variable not found: ${identifier}`,
      this.kind,
      DirectiveErrorCode.VARIABLE_NOT_FOUND
    );
  }
} 