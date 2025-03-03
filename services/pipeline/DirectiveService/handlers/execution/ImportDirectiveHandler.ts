import { DirectiveNode, MeldNode, TextNode } from 'meld-spec';
import type { DirectiveContext, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService, StructuredPath } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';

/**
 * Handler for @import directives
 * Imports variables from other Meld files
 */
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';
  private debugEnabled: boolean = false;
  private stateTrackingService?: IStateTrackingService;

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private circularityService: ICircularityService,
    trackingService?: IStateTrackingService
  ) {
    this.stateTrackingService = trackingService;
    this.debugEnabled = !!trackingService && (process.env.MELD_DEBUG === 'true');
  }

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult | IStateService> {
    let resolvedFullPath: string | undefined;
    let targetState: IStateService;
    
    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract path and imports
      const { path, imports } = node.directive;

      // 3. Process path
      if (!path) {
        throw new DirectiveError(
          'Import directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED
        );
      }

      // Use the context state directly for transformation mode
      targetState = context.state;

      // Resolve variables in path
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
      
      resolvedFullPath = await this.resolutionService.resolveInContext(
        path,
        resolutionContext
      );

      if (!resolvedFullPath) {
        throw new DirectiveError(
          `Could not resolve path: ${path}`,
          this.kind,
          DirectiveErrorCode.VARIABLE_NOT_FOUND
        );
      }

      // Check if the file exists
      const fileExists = await this.fileSystemService.exists(resolvedFullPath);
      if (!fileExists) {
        throw new DirectiveError(
          `File not found: ${resolvedFullPath}`,
          this.kind,
          DirectiveErrorCode.FILE_NOT_FOUND
        );
      }

      // Check for circular imports
      try {
        this.circularityService.beginImport(resolvedFullPath);
      } catch (error: any) {
        // Rethrow as a directive error
        throw new DirectiveError(
          `Circular import detected: ${error.message}`,
          this.kind,
          DirectiveErrorCode.CIRCULAR_REFERENCE
        );
      }

      // Read the file
      const fileContent = await this.fileSystemService.readFile(resolvedFullPath);

      // Parse the file
      const nodes = await this.parserService.parse(fileContent);

      // Create a child state for the imported file
      const importedState = context.state.createChildState();
      
      try {
        if (resolvedFullPath) {
          importedState.setCurrentFilePath(resolvedFullPath);
        }
      } catch (error) {
        logger.warn('Failed to set current file path on imported state', {
          resolvedFullPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      // Interpret the file
      const resultState = await this.interpreterService.interpret(nodes, {
        initialState: importedState,
        filePath: resolvedFullPath
      });

      // Process imports
      if (imports) {
        // Resolve variables in imports
        const resolvedImports = await this.resolutionService.resolveInContext(imports, resolutionContext);
        
        // Parse the import list
        const parsedImports = this.parseImportList(resolvedImports);
        
        // Process the structured imports
        this.processStructuredImports(parsedImports, resultState, targetState);
      } else {
        // No import list - import all variables
        this.importAllVariables(resultState, targetState);
      }

      // End import tracking
      if (resolvedFullPath) {
        this.circularityService.endImport(resolvedFullPath);
      }

      // Check if transformation is enabled
      if (targetState.isTransformationEnabled && targetState.isTransformationEnabled()) {
        // Replace the directive with empty content
        const replacement: TextNode = {
          type: 'Text',
          content: '',
          location: node.location ? {
            start: node.location.start,
            end: node.location.end
          } : undefined
        };

        // IMPORTANT: Copy variables from imported state to parent state
        // even in transformation mode
        if (context.parentState) {
          // Copy all text variables from the imported state to the parent state
          const textVars = targetState.getAllTextVars();
          textVars.forEach((value, key) => {
            if (context.parentState) {
              context.parentState.setTextVar(key, value);
            }
          });
          
          // Copy all data variables from the imported state to the parent state
          const dataVars = targetState.getAllDataVars();
          dataVars.forEach((value, key) => {
            if (context.parentState) {
              context.parentState.setDataVar(key, value);
            }
          });
          
          // Copy all path variables from the imported state to the parent state
          const pathVars = targetState.getAllPathVars();
          pathVars.forEach((value, key) => {
            if (context.parentState) {
              context.parentState.setPathVar(key, value);
            }
          });
          
          // Copy all commands from the imported state to the parent state
          const commands = targetState.getAllCommands();
          commands.forEach((value, key) => {
            if (context.parentState) {
              context.parentState.setCommand(key, value);
            }
          });
        }

        return {
          state: targetState,
          replacement
        };
      } else {
        // If parent state exists, copy all variables back to it
        if (context.parentState) {
          // Copy all text variables from the imported state to the parent state
          const textVars = targetState.getAllTextVars();
          textVars.forEach((value, key) => {
            if (context.parentState) {
              context.parentState.setTextVar(key, value);
            }
          });
          
          // Copy all data variables from the imported state to the parent state
          const dataVars = targetState.getAllDataVars();
          dataVars.forEach((value, key) => {
            if (context.parentState) {
              context.parentState.setDataVar(key, value);
            }
          });
          
          // Copy all path variables from the imported state to the parent state
          const pathVars = targetState.getAllPathVars();
          pathVars.forEach((value, key) => {
            if (context.parentState) {
              context.parentState.setPathVar(key, value);
            }
          });
          
          // Copy all commands from the imported state to the parent state
          const commands = targetState.getAllCommands();
          commands.forEach((value, key) => {
            if (context.parentState) {
              context.parentState.setCommand(key, value);
            }
          });
        }
        
        // Log the import operation
        logger.debug('Import complete', {
          path: resolvedFullPath,
          imports,
          targetState
        });
        
        return targetState;
      }
    } catch (error: unknown) {
      // Handle errors
      let errorObj: DirectiveError;
      
      if (!(error instanceof DirectiveError)) {
        // For specific error types, create standardized DirectiveError with expected messages
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (error instanceof Error && error.name === 'MeldResolutionError' && errorMessage.includes('Variable not found')) {
          errorObj = new DirectiveError(
            errorMessage,
            this.kind,
            DirectiveErrorCode.VARIABLE_NOT_FOUND
          );
        } else if (errorMessage === 'Parse error') {
          errorObj = new DirectiveError(
            errorMessage,
            this.kind,
            DirectiveErrorCode.EXECUTION_FAILED
          );
        } else if (errorMessage === 'Interpretation error') {
          errorObj = new DirectiveError(
            errorMessage,
            this.kind,
            DirectiveErrorCode.EXECUTION_FAILED
          );
        } else if (errorMessage === 'Read error') {
          errorObj = new DirectiveError(
            errorMessage,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND
          );
        } else {
          // Generic wrapper for other error types
          errorObj = new DirectiveError(
            `Import directive error: ${errorMessage}`,
            this.kind,
            DirectiveErrorCode.EXECUTION_FAILED,
            {
              cause: error instanceof Error ? error : undefined
            }
          );
        }
      } else {
        errorObj = error;
      }
      
      // End import tracking if necessary
      if (resolvedFullPath) {
        try {
          this.circularityService.endImport(resolvedFullPath);
        } catch (cleanupError) {
          logger.warn('Error during import cleanup', { error: cleanupError });
        }
      }

      // Always throw the error, even in transformation mode
      throw errorObj;
    }
  }

  private processImportList(importList: string, sourceState: IStateService, targetState: IStateService): void {
    // Parse the import list and process it
    const importItems = this.parseImportList(importList);
    this.processStructuredImports(importItems, sourceState, targetState);
  }

  private parseImportList(importList: string): Array<{ name: string; alias?: string }> {
    // Handle undefined or null importList
    if (!importList) {
      return [{ name: '*' }]; // Default to importing everything
    }
    
    // Split by commas, but handle potential quoted strings
    const result: Array<{ name: string; alias?: string }> = [];
    
    // Simple split for now, might need more robust parsing later
    const parts = importList.split(',').map(p => p.trim());
    
    for (const part of parts) {
      // Check for 'as' keyword to identify aliases
      if (part.includes(' as ')) {
        // Format: "name as alias"
        const [name, alias] = part.split(' as ').map(p => p.trim());
        result.push({ name, alias });
      } else {
        // Just a name without alias
        result.push({ name: part });
      }
    }
    
    return result;
  }

  private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
    // Track context boundary before import (safely)
    let filePath: string | null | undefined = null;
    try {
      filePath = sourceState.getCurrentFilePath();
    } catch (error) {
      // Handle the case where getCurrentFilePath is not available
      logger.debug('Error getting current file path', { error });
    }
    this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);
    
    // Import all text variables
    const textVars = sourceState.getAllTextVars();
    textVars.forEach((value, name) => {
      targetState.setTextVar(name, value);
      this.trackVariableCrossing(name, 'text', sourceState, targetState);
    });
    
    // Import all data variables
    const dataVars = sourceState.getAllDataVars();
    dataVars.forEach((value, name) => {
      targetState.setDataVar(name, value);
      this.trackVariableCrossing(name, 'data', sourceState, targetState);
    });
    
    // Import all path variables
    const pathVars = sourceState.getAllPathVars();
    pathVars.forEach((value, name) => {
      targetState.setPathVar(name, value);
      this.trackVariableCrossing(name, 'path', sourceState, targetState);
    });
    
    // Import all commands
    const commands = sourceState.getAllCommands();
    commands.forEach((value, name) => {
      targetState.setCommand(name, value);
      this.trackVariableCrossing(name, 'command', sourceState, targetState);
    });
    
    // Track context boundary after import (safely)
    this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);
  }

  private importVariable(name: string, alias: string | undefined, sourceState: IStateService, targetState: IStateService): void {
    // Use alias if provided, otherwise use original name
    const actualName = alias || name;
    
    // Track context boundary before import (safely)
    let filePath: string | null | undefined = null;
    try {
      filePath = sourceState.getCurrentFilePath();
    } catch (error) {
      // Handle the case where getCurrentFilePath is not available
      logger.debug('Error getting current file path', { error });
    }
    this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);

    // Try to import as text variable
    const hasTextVar = sourceState.getTextVar(name) !== undefined;
    if (hasTextVar) {
      const value = sourceState.getTextVar(name);
      if (value !== undefined) {
        targetState.setTextVar(actualName, value);
        this.trackVariableCrossing(name, 'text', sourceState, targetState, alias);
        
        // Track context boundary after import (safely)
        this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);
        return;
      }
    }

    // Try to import as data variable
    const hasDataVar = sourceState.getDataVar(name) !== undefined;
    if (hasDataVar) {
      const value = sourceState.getDataVar(name);
      targetState.setDataVar(actualName, value);
      this.trackVariableCrossing(name, 'data', sourceState, targetState, alias);
      
      // Track context boundary after import (safely)
      this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);
      return;
    }

    // Try to import as path variable
    const hasPathVar = sourceState.getPathVar(name) !== undefined;
    if (hasPathVar) {
      const value = sourceState.getPathVar(name);
      if (value !== undefined) {
        targetState.setPathVar(actualName, value);
        this.trackVariableCrossing(name, 'path', sourceState, targetState, alias);
        
        // Track context boundary after import (safely)
        this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);
        return;
      }
    }

    // Try to import as command
    if (sourceState.getCommand) {
      const command = sourceState.getCommand(name);
      if (command) {
        targetState.setCommand(actualName, command);
        this.trackVariableCrossing(name, 'command', sourceState, targetState, alias);
        
        // Track context boundary after import (safely)
        this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);
        return;
      }
    }

    // Track context boundary after import attempt (safely), even if it failed
    this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);

    // Variable not found
    throw new DirectiveError(
      `Variable "${name}" not found in imported file`,
      this.kind,
      DirectiveErrorCode.VARIABLE_NOT_FOUND
    );
  }

  /**
   * Track context boundary between states
   */
  private trackContextBoundary(sourceState: IStateService, targetState: IStateService, filePath?: string): void {
    if (!this.debugEnabled || !this.stateTrackingService) {
      return;
    }

    try {
      const sourceId = sourceState.getStateId();
      const targetId = targetState.getStateId();
      
      if (!sourceId || !targetId) {
        logger.debug('Cannot track context boundary - missing state ID', {
          source: sourceState,
          target: targetState
        });
        return;
      }
      
      logger.debug('Tracking context boundary', {
        sourceId,
        targetId,
        filePath
      });
      
      // Call the tracking service method - we know it exists on the implementation
      // even though it's not in the interface
      (this.stateTrackingService as any).trackContextBoundary(
        sourceId,
        targetId,
        'import',
        filePath || ''
      );
    } catch (error) {
      // Don't let tracking errors affect normal operation
      logger.debug('Error tracking context boundary', { error });
    }
  }

  /**
   * Track variable copying between contexts
   */
  private trackVariableCrossing(
    variableName: string,
    variableType: 'text' | 'data' | 'path' | 'command',
    sourceState: IStateService,
    targetState: IStateService,
    alias?: string
  ): void {
    if (!this.debugEnabled || !this.stateTrackingService) {
      return;
    }

    try {
      const sourceId = sourceState.getStateId();
      const targetId = targetState.getStateId();
      
      if (!sourceId || !targetId) {
        logger.debug('Cannot track variable crossing - missing state ID', {
          source: sourceState,
          target: targetState
        });
        return;
      }
      
      logger.debug('Tracking variable crossing', {
        variableName,
        variableType,
        sourceId,
        targetId,
        alias
      });
      
      // Call the tracking service method - we know it exists on the implementation
      // even though it's not in the interface
      (this.stateTrackingService as any).trackVariableCrossing(
        sourceId,
        targetId,
        variableName,
        variableType,
        alias
      );
    } catch (error) {
      // Don't let tracking errors affect normal operation
      logger.debug('Error tracking variable crossing', { error });
    }
  }

  private processStructuredImports(
    imports: Array<{ name: string; alias?: string }>, 
    sourceState: IStateService, 
    targetState: IStateService
  ): void {
    // Add at the beginning of the method
    // Track the context boundary between source and target states
    let filePath: string | null | undefined = null;
    try {
      filePath = sourceState.getCurrentFilePath();
    } catch (error) {
      // Handle the case where getCurrentFilePath is not available
      logger.debug('Error getting current file path', { error });
    }
    this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);

    // If imports is empty or contains a wildcard, import everything
    if (imports.length === 0 || imports.some(i => i.name === '*')) {
      this.importAllVariables(sourceState, targetState);
      return;
    }
    
    // Import each variable individually
    for (const item of imports) {
      try {
        this.importVariable(item.name, item.alias, sourceState, targetState);
      } catch (error) {
        if (error instanceof DirectiveError && error.code === DirectiveErrorCode.VARIABLE_NOT_FOUND) {
          // Log warning but continue with other imports
          logger.warn(`Import warning: ${error.message}`);
        } else {
          // Re-throw other errors
          throw error;
        }
      }
    }
  }
} 