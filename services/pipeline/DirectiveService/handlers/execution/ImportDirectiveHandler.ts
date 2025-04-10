import { DirectiveNode, MeldNode, TextNode, VariableReferenceNode, SourceLocation, VariableType } from '@core/syntax/types/index.js';
import type {
  ImportDirectiveData
} from '@core/syntax/types/index.js';
import type {
  TextVariable,
  DataVariable,
  IPathVariable,
  CommandVariable,
  VariableMetadata,
  MeldVariable,
} from '@core/types/variables.js';
import { VariableOrigin } from '@core/types/variables.js';
import type { JsonValue } from '@core/types/common.js';
import type {
  MeldPath,
  StructuredPath
} from '@core/types/paths.js';
import type { DirectiveContext, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { StateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IURLContentResolver, URLFetchOptions, URLValidationOptions } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { RawPath } from '@core/types/paths';

/**
 * Handler for @import directives
 * Imports variables from other Meld files
 */
@injectable()
@Service({
  description: 'Handler for @import directives'
})
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';
  private debugEnabled: boolean = false;
  private stateTrackingService?: IStateTrackingService;
  private interpreterServiceClient?: IInterpreterServiceClient;

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IStateService') private stateService: IStateService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService,
    @inject('IParserService') private parserService: IParserService,
    @inject('IPathService') private pathService: IPathService,
    @inject('InterpreterServiceClientFactory') private interpreterServiceClientFactory: InterpreterServiceClientFactory,
    @inject('ICircularityService') private circularityService: ICircularityService,
    @inject('IURLContentResolver') private urlContentResolver?: IURLContentResolver,
    @inject('StateTrackingService') trackingService?: IStateTrackingService
  ) {
    this.stateTrackingService = trackingService;
    this.debugEnabled = !!trackingService && (process.env.MELD_DEBUG === 'true');
    try {
      this.interpreterServiceClient = this.interpreterServiceClientFactory.createClient();
    } catch (error) {
       logger.warn('Failed to get interpreter service client from factory during construction', { error });
    }
  }

  private ensureInterpreterServiceClient(): IInterpreterServiceClient {
    // First try to get the client from the factory
    if (!this.interpreterServiceClient && this.interpreterServiceClientFactory) {
      try {
        this.interpreterServiceClient = this.interpreterServiceClientFactory.createClient();
      } catch (error) {
        logger.warn('Failed to get interpreter service client from factory', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // If we still don't have a client (because factory failed or wasn't available),
    // throw an error. Tests MUST provide a mock via TestContextDI.
    if (!this.interpreterServiceClient) {
      throw new DirectiveError(
        'Interpreter service client is not available. Ensure InterpreterServiceClientFactory is registered and resolvable, or provide a mock in tests.',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED
      );
    }
    
    return this.interpreterServiceClient;
  }

  async execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<DirectiveResult> {
    let resolvedIdentifier: string | undefined;
    let targetState: IStateService;
    let resultState: IStateService;
    let isURLImport = false;
    const importDirectiveLocation = node.location;

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract path object and imports from the new AST structure
      const { path: pathObject, imports } = node.directive as ImportDirectiveData;
      isURLImport = !!pathObject.structured?.url;

      // Use the context state directly
      targetState = context.state;

      // 3. Resolve the PathValueObject using ResolutionService.resolvePath
      const resolutionContext = ResolutionContextFactory.create(
        targetState,
        context.currentFilePath
      );

      let resolvedPath: MeldPath;
      try {
        // Let resolvePath handle strings, variables, interpolation, etc.
        resolvedPath = await this.resolutionService.resolveInContext(pathObject, context.resolutionContext);
        resolvedIdentifier = resolvedPath.validatedPath; // Get the final string path
        // Determine if it's a URL based on the resolved MeldPath type
        isURLImport = resolvedPath.contentType === 'url'; 
        logger.debug(`Resolved import path`, { input: pathObject.raw, resolved: resolvedIdentifier, isURL: isURLImport });
      } catch (error) {
          // Wrap resolution errors
          throw new DirectiveError(
            `Failed to resolve import path \"${pathObject.raw}\": ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            { location: node.location, cause: error instanceof Error ? error : undefined }
          );
      }
      
      let fileContent: string;

      // 4. Handle URL vs. File Path based on resolved isURLImport flag
      if (isURLImport) {
        // Use resolvedIdentifier directly as it's the validated URL string
        const urlToFetch = resolvedIdentifier;
        if (!urlToFetch) {
           // This check might be redundant if resolvePath guarantees a string path
           throw new DirectiveError('URL import path resolved to an empty string', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { location: node.location });
        }

        try {
          const urlOptions = {};
          if (this.urlContentResolver) {
            logger.debug('Using URLContentResolver for URL validation and fetching', { url: urlToFetch });
            await this.urlContentResolver.validateURL(resolvedPath.originalValue as RawPath, urlOptions);
          } else {
            logger.debug('URLContentResolver not available, falling back to PathService', { url: urlToFetch });
            await this.pathService.validateURL(resolvedPath.originalValue as RawPath, urlOptions);
          }

          try {
            const normalizedUrl = urlToFetch.replace(/\\\\/g, '/');
            logger.debug('Checking for circular imports in URL import', { url: urlToFetch, normalizedUrl });
            this.circularityService.beginImport(normalizedUrl);
          } catch (error: any) {
            throw new DirectiveError(`Circular import detected: ${error.message}`, this.kind, DirectiveErrorCode.CIRCULAR_REFERENCE);
          }

          const response = this.urlContentResolver
            ? await this.urlContentResolver.fetchURL(urlToFetch, { bypassCache: false })
            : await this.pathService.fetchURL(resolvedPath.validatedPath as any, { bypassCache: false });

          fileContent = response.content;

          // Register for source mapping
          try {
            const { registerSource, addMapping } = require('@core/utils/sourceMapUtils.js');
            registerSource(resolvedIdentifier, fileContent);
            
            if (node.location && node.location.start) {
              addMapping(
                resolvedIdentifier,
                1,
                1,
                node.location.start.line,
                node.location.start.column
              );
            }
          } catch (err) {
            logger.debug('Source mapping not available, skipping', { error: err });
          }
        } catch (error: any) {
          if (typeof error === 'object' && error !== null) {
            if (error.name === 'URLValidationError' || error.name === 'URLSecurityError') {
              throw new DirectiveError(`URL validation error: ${error.message}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, { cause: error as Error });
            }
            if (error.name === 'URLFetchError') {
              throw new DirectiveError(`Failed to fetch URL: ${error.message}`, this.kind, DirectiveErrorCode.FILE_NOT_FOUND, { cause: error as Error });
            }
          }
          if (error instanceof DirectiveError) { throw error; }
          throw new DirectiveError(`URL import error: ${error instanceof Error ? error.message : String(error)}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED, { location: node.location, cause: error instanceof Error ? error : undefined });
        }
      } else {
        // Use resolvedIdentifier directly as it's the validated file path string
        const filePathToRead = resolvedIdentifier;
        if (!filePathToRead) {
           // This check might be redundant if resolvePath guarantees a string path
           throw new DirectiveError('File import path resolved to an empty string', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { location: node.location });
        }

        const fileExists = await this.fileSystemService.exists(resolvedPath.validatedPath);
        if (!fileExists) {
          throw new DirectiveError(`File not found: ${filePathToRead}`, this.kind, DirectiveErrorCode.FILE_NOT_FOUND);
        }

        try {
          const normalizedPath = filePathToRead.replace(/\\\\/g, '/');
          logger.debug('Checking for circular imports', { originalPath: filePathToRead, normalizedPath });
          this.circularityService.beginImport(normalizedPath);
        } catch (error: any) {
          throw new DirectiveError(`Circular import detected: ${error.message}`, this.kind, DirectiveErrorCode.CIRCULAR_REFERENCE);
        }

        fileContent = await this.fileSystemService.readFile(resolvedPath.validatedPath);
      }

      try {
        const { registerSource, addMapping } = require('@core/utils/sourceMapUtils.js');
        registerSource(resolvedIdentifier, fileContent);
        if (node.location && node.location.start) {
          addMapping(
            resolvedIdentifier,
            1,
            1,
            node.location.start.line,
            node.location.start.column
          );
          logger.debug(`Added source mapping from ${resolvedIdentifier}:1:1 to line ${node.location.start.line}:${node.location.start.column}`);
        }
      } catch (err) {
        logger.debug('Source mapping not available, skipping', { error: err });
      }

      const parsedResults = await this.parserService.parse(fileContent);
      const nodesToInterpret = Array.isArray(parsedResults) ? parsedResults : [];

      const importedState = context.state.createChildState();
      if (resolvedIdentifier) {
        importedState.setCurrentFilePath(resolvedIdentifier);
      }

      try {
        const interpreterClient = this.ensureInterpreterServiceClient();
        logger.debug('Interpreting imported file', { filePath: resolvedIdentifier, hasInitialState: !!importedState });

        resultState = await interpreterClient.interpret(
          nodesToInterpret,
          importedState,
          { currentFilePath: resolvedIdentifier }
        );

        logger.debug('Import interpretation complete', {
          filePath: resolvedIdentifier,
          textVarsCount: resultState?.getAllTextVars().size || 0,
          dataVarsCount: resultState?.getAllDataVars().size || 0,
          pathVarsCount: resultState?.getAllPathVars().size || 0,
          commandsCount: resultState?.getAllCommands().size || 0
        });

        if (resultState) {
          let parentState = null;
          
          if (importedState.getParentState && typeof importedState.getParentState === 'function') {
            try {
              parentState = importedState.getParentState();
              logger.debug('Found parent state via getParentState() method', {
                filePath: resolvedIdentifier,
                parentStateId: parentState?.getStateId?.() || 'unknown'
              });
            } catch (error) {
              logger.debug('Error getting parent state via getParentState()', { error });
            }
          }
          
          if (!parentState && context && context.parentState) {
            parentState = context.parentState;
            logger.debug('Using context.parentState as fallback', {
              filePath: resolvedIdentifier,
              parentStateId: parentState?.getStateId?.() || 'unknown'
            });
          }
          
          if (parentState) {
            logger.debug('Propagating variables to parent state from imported file', {
              filePath: resolvedIdentifier
            });
            
            const textVars = resultState.getAllTextVars();
            textVars.forEach((value, key) => {
              try {
                parentState.setTextVar(key, value.value);
                logger.debug(`Propagated text variable to parent: ${key}`);
              } catch (err) {
                logger.warn(`Failed to propagate text variable ${key} to parent`, { error: err });
              }
            });
            
            const dataVars = resultState.getAllDataVars();
            dataVars.forEach((value, key) => {
              try {
                parentState.setDataVar(key, value.value);
                logger.debug(`Propagated data variable to parent: ${key}`);
              } catch (err) {
                logger.warn(`Failed to propagate data variable ${key} to parent`, { error: err });
              }
            });
            
            const pathVars = resultState.getAllPathVars();
            pathVars.forEach((value, key) => {
              try {
                parentState.setPathVar(key, value.value);
                logger.debug(`Propagated path variable to parent: ${key}`);
              } catch (err) {
                logger.warn(`Failed to propagate path variable ${key} to parent`, { error: err });
              }
            });
            
            const commands = resultState.getAllCommands();
            commands.forEach((value, key) => {
              try {
                parentState.setCommand(key, value.value);
                logger.debug(`Propagated command to parent: ${key}`);
              } catch (err) {
                logger.warn(`Failed to propagate command ${key} to parent`, { error: err });
              }
            });
          }
        }
      } catch (error) {
        if (error instanceof DirectiveError) { throw error; }
        throw new DirectiveError(`Failed to interpret imported file: ${error instanceof Error ? error.message : String(error)}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED);
      }

      if (!imports || imports.length === 0 || imports.some(i => i.name === '*')) {
          this.importAllVariables(resultState, targetState, importDirectiveLocation);
      } else {
          this.processStructuredImports(imports, resultState, targetState, importDirectiveLocation);
      }

      if (resolvedIdentifier) {
        const normalizedIdentifier = resolvedIdentifier.replace(/\\\\/g, '/');
        this.circularityService.endImport(normalizedIdentifier);
        logger.debug(`Ended import tracking for ${isURLImport ? 'URL' : 'file'}`, { identifier: resolvedIdentifier, normalizedIdentifier });
      }

      // Always return a DirectiveResult, use empty text node if no visual output
      const replacement: TextNode = {
        type: 'Text',
        content: '',
        location: node.location
      };
      return {
        state: targetState,
        replacement
      };
    } catch (error: unknown) {
      let errorObj: DirectiveError;
      if (error instanceof DirectiveError) {
        errorObj = error;
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
         errorObj = new DirectiveError(
           `Import directive error: ${errorMessage}`,
           this.kind,
           DirectiveErrorCode.EXECUTION_FAILED,
           { cause: error instanceof Error ? error : undefined }
         );
      }

      if (resolvedIdentifier) {
        try {
          const normalizedIdentifier = resolvedIdentifier.replace(/\\\\/g, '/');
          this.circularityService.endImport(normalizedIdentifier);
        } catch (cleanupError) {
          logger.warn('Error during import cleanup on error path', { error: cleanupError });
        }
      }
      throw errorObj;
    }
  }

  private importAllVariables(
      sourceState: IStateService,
      targetState: IStateService,
      importLocation: SourceLocation
    ): void {
    if (!sourceState || !targetState) {
      logger.warn('Cannot import variables - null or undefined state');
      return;
    }

    const createMetadata = (originalVar?: MeldVariable): VariableMetadata => ({
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      definedAt: importLocation,
      origin: VariableOrigin.IMPORT,
      context: originalVar?.metadata?.definedAt ? { importedFrom: originalVar.metadata.definedAt } : undefined,
    });

    try {
      const textVars = sourceState.getAllTextVars();
      textVars.forEach((originalVar, key) => {
        try {
          const newVar: TextVariable = {
            type: VariableType.TEXT,
            value: originalVar.value,
            metadata: createMetadata(originalVar)
          };
          targetState.setTextVar(key, newVar.value);
          logger.debug(`Imported text variable: ${key}`);
        } catch (error) {
          logger.warn(`Failed to import text variable ${key}`, { error });
        }
      });

      const dataVars = sourceState.getAllDataVars();
      dataVars.forEach((originalVar, key) => {
        try {
          const valueCopy = JSON.parse(JSON.stringify(originalVar.value)) as JsonValue;
          const newVar: DataVariable = {
            type: VariableType.DATA,
            value: valueCopy,
            metadata: createMetadata(originalVar)
          };
          targetState.setDataVar(key, newVar.value);
          logger.debug(`Imported data variable: ${key}`);
        } catch (error) {
          logger.warn(`Failed to import data variable ${key}`, { error });
        }
      });

      const pathVars = sourceState.getAllPathVars();
      pathVars.forEach((originalVar, key) => {
        try {
           const newVar: IPathVariable = {
             ...originalVar,
             metadata: createMetadata(originalVar)
           };
           targetState.setPathVar(key, newVar.value);
           logger.debug(`Imported path variable: ${key}`);
        } catch (error) {
          logger.warn(`Failed to import path variable ${key}`, { error });
        }
      });

      const commands = sourceState.getAllCommands();
      commands.forEach((originalVar, key) => {
        try {
           const newVar: CommandVariable = {
             ...originalVar,
             metadata: createMetadata(originalVar)
           };
           targetState.setCommand(key, newVar.value);
           logger.debug(`Imported command: ${key}`);
        } catch (error) {
          logger.warn(`Failed to import command ${key}`, { error });
        }
      });
    } catch (error) {
      logger.warn('Error during importAllVariables', { error });
    }
  }

  private processStructuredImports(
    imports: Array<{ name: string; alias?: string | null }>,
    sourceState: IStateService,
    targetState: IStateService,
    importLocation: SourceLocation
  ): void {
    const createMetadata = (originalVar?: MeldVariable): VariableMetadata => ({
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      definedAt: importLocation,
      origin: VariableOrigin.IMPORT,
      context: originalVar?.metadata?.definedAt ? { importedFrom: originalVar.metadata.definedAt } : undefined,
    });

    for (const item of imports) {
      try {
        const { name, alias } = item;
        const targetName = alias || name;
        let variableFound = false;

        const textVar = sourceState.getTextVar(name);
        if (textVar) {
          const newVar: TextVariable = { type: VariableType.TEXT, value: textVar.value, metadata: createMetadata(textVar) };
          targetState.setTextVar(targetName, newVar.value);
          logger.debug(`Imported text variable: ${name} as ${targetName}`);
          variableFound = true;
          continue;
        }

        const dataVar = sourceState.getDataVar(name);
        if (dataVar) {
          const valueCopy = JSON.parse(JSON.stringify(dataVar.value)) as JsonValue;
          const newVar: DataVariable = { type: VariableType.DATA, value: valueCopy, metadata: createMetadata(dataVar) };
          targetState.setDataVar(targetName, newVar.value);
          logger.debug(`Imported data variable: ${name} as ${targetName}`);
          variableFound = true;
          continue;
        }

        const pathVar = sourceState.getPathVar(name);
        if (pathVar) {
           const newVar: IPathVariable = { ...pathVar, metadata: createMetadata(pathVar) };
           targetState.setPathVar(targetName, newVar.value);
           logger.debug(`Imported path variable: ${name} as ${targetName}`);
           variableFound = true;
           continue;
        }

        const commandVar = sourceState.getCommand(name);
        if (commandVar) {
           const newVar: CommandVariable = {
             type: VariableType.COMMAND,
             value: commandVar,
             metadata: createMetadata(undefined)
           };
           targetState.setCommand(targetName, newVar);
           logger.debug(`Imported command: ${name} as ${targetName}`);
           variableFound = true;
           continue;
        }

        if (!variableFound) {
           logger.warn(`Variable "${name}" not found in imported state for structured import.`);
        }
      } catch (error) {
         logger.warn(`Failed to import variable ${item.name} as ${item.alias || item.name}`, { error });
      }
    }
  }
}