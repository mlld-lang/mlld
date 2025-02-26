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

interface PathObject {
  raw: string;
  normalized?: string;
  structured?: any;
}

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
      
      // Handle path - could be a string, a structured path object, or in the value property (backward compatibility)
      let pathValue: string | undefined;
      
      if (path) {
        if (typeof path === 'string') {
          pathValue = path;
        } else if (typeof path === 'object' && path && 'raw' in path) {
          pathValue = path.raw;
        } else if (typeof path === 'object' && path && 'normalized' in path) {
          pathValue = path.normalized as string;
        }
      } else if (value) {
        pathValue = this.extractPath(value);
      }
      
      // Only use identifier as import list if it's not 'import' (which is the directive identifier)
      const resolvedImportList = importList || (identifier !== 'import' ? identifier : undefined);

      if (!pathValue) {
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

      // Resolve the path using the resolution service
      resolvedFullPath = await this.resolutionService.resolveInContext(
        typeof pathValue === 'string' ? pathValue : pathValue.raw,
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
            `Import file not found: [${typeof pathValue === 'string' ? pathValue : pathValue.raw}]`,
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
          path: typeof pathValue === 'string' ? pathValue : pathValue.raw,
          importList: resolvedImportList,
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

  private extractPath(value: string | any): string | undefined {
    if (typeof value === 'string') {
      const pathMatch = value.match(/path\s*=\s*["']([^"']+)["']/);
      return pathMatch?.[1];
    } else if (value && typeof value === 'object') {
      // Handle structured path object
      if ('raw' in value && typeof value.raw === 'string') {
        return value.raw;
      } else if ('normalized' in value && typeof value.normalized === 'string') {
        return value.normalized;
      }
    }
    return undefined;
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
      `Variable not found in imported file: ${name}`,
      this.kind,
      DirectiveErrorCode.VARIABLE_NOT_FOUND,
      {
        severity: DirectiveErrorSeverity[DirectiveErrorCode.VARIABLE_NOT_FOUND]
      }
    );
  }
} 