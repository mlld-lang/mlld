import { DirectiveNode, MeldNode } from 'meld-spec';
import type { DirectiveContext, IDirectiveHandler, DirectiveResult } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

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

      // Get path and import list from directive
      const { path, value, identifier, importList } = node.directive;
      const resolvedPath = path || this.extractPath(value);
      // Only use identifier as import list if it's not 'import' (which is the directive identifier)
      const resolvedImportList = importList || (identifier !== 'import' ? identifier : undefined);

      if (!resolvedPath) {
        throw new DirectiveError(
          'Import directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
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

      // Resolve the path using the resolution service
      resolvedFullPath = await this.resolutionService.resolveInContext(
        resolvedPath,
        resolutionContext
      );

      // Check for circular imports before proceeding
      try {
        this.circularityService.beginImport(resolvedFullPath);
      } catch (error) {
        throw new DirectiveError(
          error?.message || 'Circular import detected',
          this.kind,
          DirectiveErrorCode.CIRCULAR_IMPORT,
          { node, context, cause: error }
        );
      }

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedFullPath)) {
          throw new DirectiveError(
            `Import file not found: [${resolvedPath}]`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { node, context }
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

        // Import variables based on import list
        const imports = this.parseImportList(resolvedImportList || '*');
        for (const { name, alias } of imports) {
          if (name === '*') {
            this.importAllVariables(interpretedState, clonedState);
          } else {
            this.importVariable(name, alias, interpretedState, clonedState);
          }
        }

        logger.debug('Import directive processed successfully', {
          path: resolvedPath,
          importList: resolvedImportList,
          location: node.location
        });

        // If transformation is enabled, return an empty text node to remove the directive from output
        if (context.state.isTransformationEnabled?.()) {
          const replacement: MeldNode = {
            type: 'text',
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
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }

  private extractPath(value: string): string | undefined {
    if (!value) return undefined;
    // Remove brackets if present and trim whitespace
    return value.replace(/^\[(.*)\]$/, '$1').trim();
  }

  private parseImportList(importList: string): Array<{ name: string; alias?: string }> {
    if (!importList) return [{ name: '*' }];  // Default to importing everything
    if (importList === '*') return [{ name: '*' }];

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
    for (const [name, value] of textVars.entries()) {
      targetState.setTextVar(name, value);
    }

    // Import all data variables
    const dataVars = sourceState.getAllDataVars();
    for (const [name, value] of dataVars.entries()) {
      targetState.setDataVar(name, value);
    }

    // Import all path variables
    const pathVars = sourceState.getAllPathVars();
    for (const [name, value] of pathVars.entries()) {
      targetState.setPathVar(name, value);
    }

    // Import all commands
    const commands = sourceState.getAllCommands();
    for (const [name, value] of commands.entries()) {
      targetState.setCommand(name, value);
    }
  }

  private importVariable(name: string, alias: string | undefined, sourceState: IStateService, targetState: IStateService): void {
    // Try each variable type in order
    const textValue = sourceState.getTextVar(name);
    if (textValue !== undefined) {
      targetState.setTextVar(alias || name, textValue);
      return;
    }

    const dataValue = sourceState.getDataVar(name);
    if (dataValue !== undefined) {
      targetState.setDataVar(alias || name, dataValue);
      return;
    }

    const pathValue = sourceState.getPathVar(name);
    if (pathValue !== undefined) {
      targetState.setPathVar(alias || name, pathValue);
      return;
    }

    const commandValue = sourceState.getCommand(name);
    if (commandValue !== undefined) {
      targetState.setCommand(alias || name, commandValue);
      return;
    }

    // If we get here, the variable wasn't found
    throw new DirectiveError(
      `Variable not found: ${name}`,
      this.kind,
      DirectiveErrorCode.VARIABLE_NOT_FOUND
    );
  }
} 