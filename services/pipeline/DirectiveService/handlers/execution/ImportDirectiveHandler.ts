import { DirectiveNode, MeldNode, TextNode, StructuredPath } from 'meld-spec';
import type { DirectiveContext, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

/**
 * Handler for @import directives
 * Imports variables from other files
 * When transformation is enabled, the directive is removed from output
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

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult | IStateService> {
    let resolvedFullPath: string | undefined;
    
    try {
      // Validate the directive
      await this.validationService.validate(node);

      // Get path and import list directly from the AST structure
      const { path, importList } = node.directive;
      
      if (!path) {
        throw new DirectiveError(
          'Import directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
          }
        );
      }

      // Create a new state for modifications
      const clonedState = context.state.clone();

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

      // Get the raw path string from the structured path object
      let pathValue: string;
      if (typeof path === 'string') {
        pathValue = path;
      } else if (path.raw) {
        pathValue = path.raw;
      } else if (path.normalized) {
        pathValue = path.normalized;
      } else {
        throw new DirectiveError(
          'Import directive has invalid path format',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
          }
        );
      }

      // Resolve the path using the resolution service
      resolvedFullPath = await this.resolutionService.resolveInContext(
        pathValue,
        resolutionContext
      );

      // Check for circular imports before proceeding
      try {
        this.circularityService.beginImport(resolvedFullPath);
      } catch (error) {
        throw new DirectiveError(
          error?.message || 'Circular import detected',
          this.kind,
          DirectiveErrorCode.CIRCULAR_REFERENCE,
          { 
            node, 
            context, 
            cause: error,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.CIRCULAR_REFERENCE]
          }
        );
      }

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedFullPath)) {
          throw new DirectiveError(
            `Import file not found: [${pathValue}]`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { 
              node, 
              context,
              severity: DirectiveErrorSeverity[DirectiveErrorCode.FILE_NOT_FOUND]
            }
          );
        }

        // Read and parse the file
        const content = await this.fileSystemService.readFile(resolvedFullPath);
        const nodes = await this.parserService.parse(content);

        // Create child state for interpretation
        const childState = clonedState.createChildState();

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedFullPath,
          mergeState: false
        });

        // Process imports based on importList
        if (!importList || importList === '*') {
          // Import all variables
          this.importAllVariables(interpretedState, clonedState);
        } else {
          // Process the import list
          this.processImportList(importList, interpretedState, clonedState);
        }

        logger.debug('Import directive processed successfully', {
          path: pathValue,
          importList: importList,
          location: node.location
        });

        // If transformation is enabled, return an empty text node to remove the directive from output
        if (context.state.isTransformationEnabled?.()) {
          const replacement: TextNode = {
            type: 'Text',
            content: '',
            location: node.location
          };
          return { state: clonedState, replacement };
        }

        return clonedState;
      } finally {
        // Always end import tracking
        if (resolvedFullPath) {
          this.circularityService.endImport(resolvedFullPath);
        }
      }
    } catch (error) {
      // Always end import tracking on error
      if (resolvedFullPath) {
        this.circularityService.endImport(resolvedFullPath);
      }

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
          cause: error instanceof Error ? error : new Error(String(error)),
          severity: DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED]
        }
      );
    }
  }

  /**
   * Process import list from the directive's importList property
   * @private
   */
  private processImportList(importList: string, sourceState: IStateService, targetState: IStateService): void {
    // Parse import list for import expressions
    const importExpressions = this.parseImportList(importList);
    
    // Import variables based on the import expressions
    for (const { name, alias } of importExpressions) {
      this.importVariable(name, alias, sourceState, targetState);
    }
  }

  /**
   * Parse import list to extract variable names and aliases
   * @private
   */
  private parseImportList(importList: string): Array<{ name: string; alias?: string }> {
    if (!importList || importList === '*') {
      return [{ name: '*' }];
    }

    // Remove brackets if present and split by commas
    const cleanList = importList.replace(/^\[(.*)\]$/, '$1');
    const parts = cleanList.split(',').map(part => part.trim());

    return parts.map(part => {
      // Handle colon syntax (var:alias)
      if (part.includes(':')) {
        const [name, alias] = part.split(':').map(s => s.trim());
        return { name, alias };
      }

      // Handle 'as' syntax (var as alias)
      const asParts = part.split(/\s+as\s+/);
      if (asParts.length > 1) {
        const [name, alias] = asParts.map(s => s.trim());
        return { name, alias };
      }

      // Single variable import
      return { name: part };
    });
  }

  private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
    // Import all text variables
    const textVars = sourceState.getAllTextVars();
    textVars.forEach((value, key) => {
      targetState.setTextVar(key, value);
    });

    // Import all data variables
    const dataVars = sourceState.getAllDataVars();
    dataVars.forEach((value, key) => {
      targetState.setDataVar(key, value);
    });

    // Import all path variables
    const pathVars = sourceState.getAllPathVars();
    pathVars.forEach((value, key) => {
      targetState.setPathVar(key, value);
    });

    // Import all commands
    const commands = sourceState.getAllCommands();
    commands.forEach((value, key) => {
      targetState.setCommand(key, value);
    });
  }

  private importVariable(name: string, alias: string | undefined, sourceState: IStateService, targetState: IStateService): void {
    const targetName = alias || name;

    // Try to import as text variable
    const textVar = sourceState.getTextVar(name);
    if (textVar !== undefined) {
      targetState.setTextVar(targetName, textVar);
      return;
    }

    // Try to import as data variable
    const dataVar = sourceState.getDataVar(name);
    if (dataVar !== undefined) {
      targetState.setDataVar(targetName, dataVar);
      return;
    }

    // Try to import as path variable
    const pathVar = sourceState.getPathVar(name);
    if (pathVar !== undefined) {
      targetState.setPathVar(targetName, pathVar);
      return;
    }

    // Try to import as command
    const command = sourceState.getCommand(name);
    if (command !== undefined) {
      targetState.setCommand(targetName, command);
      return;
    }

    // Variable not found
    throw new DirectiveError(
      `Variable "${name}" not found in imported file`,
      this.kind,
      DirectiveErrorCode.VARIABLE_NOT_FOUND,
      {
        severity: DirectiveErrorSeverity[DirectiveErrorCode.VARIABLE_NOT_FOUND]
      }
    );
  }
} 