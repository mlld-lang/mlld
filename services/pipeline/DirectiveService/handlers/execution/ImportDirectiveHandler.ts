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

      // Use the context state directly instead of cloning it
      // This ensures imported variables will be visible in the parent scope
      const targetState = context.state;

      // Create resolution context with current file's directory
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

      // Log all AST information for debugging
      console.log('Import directive path analysis:', {
        pathType: typeof path,
        pathValue: typeof path === 'string' ? path : path.raw,
        structured: typeof path === 'string' ? null : path.structured,
        normalized: typeof path === 'string' ? null : path.normalized,
        currentFilePath: context.currentFilePath,
        currentDir: context.currentFilePath ? this.fileSystemService.dirname(context.currentFilePath) : process.cwd()
      });

      // Handle the path based on what the AST provides
      if (typeof path === 'string') {
        // For string paths, use the resolution service directly
        logger.debug('Resolving string path from import directive', {
          path,
          currentFilePath: context.currentFilePath
        });
        
        // For string paths, pass to resolution service
        resolvedFullPath = await this.resolutionService.resolveInContext(
          path,
          resolutionContext
        );
      } else if (path && 'structured' in path) {
        // We have a structured path from the AST
        logger.debug('Processing structured path from import directive', {
          raw: path.raw,
          structured: path.structured,
          normalized: path.normalized,
          currentFilePath: context.currentFilePath
        });
        
        // Path variable handling - detect if this is a path variable reference
        if (path.structured.variables?.path?.length > 0) {
          // This is a path variable like $mypath
          const pathVarName = path.structured.variables.path[0];
          console.log(`Detected path variable reference: $${pathVarName}`);
          
          // Get the path variable from state
          const pathVar = context.state.getPathVar(pathVarName);
          if (pathVar) {
            console.log(`Path variable resolved: ${pathVarName} = `, pathVar);
          } else {
            console.log(`Path variable not found: ${pathVarName}`);
          }
        }
        
        // For interpolation references like ${mypath}
        if (path.raw.includes('${')) {
          console.log('Detected interpolation reference in path:', path.raw);
        }
        
        // Always pass the full structured path object
        resolvedFullPath = await this.resolutionService.resolveInContext(
          path,
          resolutionContext
        );
      } else {
        // Handle path object that doesn't match expected structure
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
        // Log the resolved path
        logger.debug('Import path resolved', {
          resolvedPath: resolvedFullPath,
          currentFilePath: context.currentFilePath
        });
        
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedFullPath)) {
          const pathStr = typeof path === 'string' ? path : path.raw || 'unknown';
          
          // Log detailed error information for debugging
          logger.error('Import file not found', {
            originalPath: pathStr,
            resolvedPath: resolvedFullPath,
            currentFilePath: context.currentFilePath,
            error: `Import file not found: [${pathStr}]`
          });
          
          // Add more detailed console logging for diagnostic purposes
          console.error('Import file not found:', {
            originalPath: pathStr,
            resolvedPath: resolvedFullPath,
            currentFilePath: context.currentFilePath,
            currentDir: context.currentFilePath ? this.fileSystemService.dirname(context.currentFilePath) : process.cwd(),
            fileExists: await this.fileSystemService.exists(resolvedFullPath),
            homePath: process.env.HOME,
            cwd: process.cwd(),
            pathType: typeof path,
            structuredPath: typeof path === 'string' ? null : path
          });
          
          // Try to check if the file exists in another location for diagnostics
          if (typeof path !== 'string' && path.raw.startsWith('$~')) {
            const homePath = process.env.HOME;
            const testPath = path.raw.replace('$~', homePath);
            console.error('Diagnostic - checking alternate path:', {
              testPath,
              exists: await this.fileSystemService.exists(testPath)
            });
          }
          
          throw new DirectiveError(
            `Import file not found: [${pathStr}]`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { 
              node, 
              context,
              severity: DirectiveErrorSeverity[DirectiveErrorCode.FILE_NOT_FOUND]
            }
          );
        }

        logger.debug('Import file found and being processed', {
          resolvedPath: resolvedFullPath,
          currentFilePath: context.currentFilePath
        });

        // Read and parse the file
        const content = await this.fileSystemService.readFile(resolvedFullPath);
        const nodes = await this.parserService.parse(content);

        // Create child state for interpretation
        const childState = targetState.createChildState();

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedFullPath,
          mergeState: false
        });

        // Process imports based on importList
        if (!importList || importList === '*') {
          // Import all variables
          this.importAllVariables(interpretedState, targetState);
        } else {
          // Process the import list
          this.processImportList(importList, interpretedState, targetState);
        }

        logger.debug('Import directive processed successfully', {
          path: typeof path === 'string' ? path : path.raw,
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
          return { state: targetState, replacement };
        }

        return targetState;
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