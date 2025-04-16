import type { DirectiveNode, MeldNode, TextNode, VariableReferenceNode } from '@core/syntax/types/index.js';
import { VariableType } from '@core/types/variables.js';
import type {
  ImportDirectiveData
} from '@core/syntax/types/index.js';
import type {
  TextVariable,
  DataVariable,
  IPathVariable,
  VariableMetadata,
  MeldVariable,
  CommandVariable,
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
import type { ICommandDefinition } from '@core/types/define.js';
import type { SourceLocation } from '@core/types/common';
import type { SourceLocation as SyntaxSourceLocation } from '@core/syntax/types/interfaces/common.js';
import type { DirectiveProcessingContext } from '@core/types/index.js';

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
    context: DirectiveProcessingContext
  ): Promise<DirectiveResult> {
    const node = context.directiveNode;
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

      // 3. Resolve the PathValueObject
      const resolutionContext = context.resolutionContext;
      if (!resolutionContext) {
        throw new DirectiveError('ResolutionContext not found in DirectiveProcessingContext', this.kind, DirectiveErrorCode.INVALID_CONTEXT, { location: node.location });
      }

      let resolvedPath: MeldPath;
      try {
        // Resolve the path object using resolveInContext first
        const valueToResolve = pathObject.interpolatedValue ?? pathObject.raw;
        const resolvedPathString = await this.resolutionService.resolveInContext(valueToResolve, resolutionContext);
        
        // Validate the resolved string to get MeldPath object
        resolvedPath = await this.resolutionService.resolvePath(resolvedPathString, resolutionContext);
        
        // Use the validated path string as the identifier
        resolvedIdentifier = resolvedPath.validatedPath; 
        
        isURLImport = resolvedPath.contentType === 'url'; 
      } catch (error) {
          // Wrap resolution/validation errors
          throw new DirectiveError(
            `Failed to resolve import path \"${pathObject.raw}\": ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            { location: node.location, cause: error instanceof Error ? error : undefined }
          );
      }
      
      const currentFilePath = context.state.getCurrentFilePath() ?? context.resolutionContext?.currentFilePath ?? undefined;

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
            await this.urlContentResolver.validateURL(resolvedPath.originalValue as RawPath, urlOptions);
          } else {
            await this.pathService.validateURL(resolvedPath.originalValue as RawPath, urlOptions);
          }

          try {
            const normalizedUrl = urlToFetch.replace(/\\\\/g, '/');
            this.circularityService.beginImport(normalizedUrl);
          } catch (error: any) {
            throw new DirectiveError(`Circular import detected: ${error.message}`, this.kind, DirectiveErrorCode.CIRCULAR_REFERENCE);
          }

          const response = this.urlContentResolver
            ? await this.urlContentResolver.fetchURL(urlToFetch, { bypassCache: false })
            : await this.pathService.fetchURL(resolvedPath.validatedPath as any, { bypassCache: false });

          fileContent = response.content;
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
          this.circularityService.beginImport(normalizedPath);
        } catch (error: any) {
          throw new DirectiveError(`Circular import detected: ${error.message}`, this.kind, DirectiveErrorCode.CIRCULAR_REFERENCE);
        }

        fileContent = await this.fileSystemService.readFile(resolvedPath.validatedPath);
      }

      const parsedResults = await this.parserService.parse(fileContent);
      const nodesToInterpret = Array.isArray(parsedResults) ? parsedResults : [];

      const importedState = await context.state.createChildState();
      if (resolvedIdentifier) {
        importedState.setCurrentFilePath(resolvedIdentifier);
      }

      try {
        const interpreterClient = this.ensureInterpreterServiceClient();

        resultState = await interpreterClient.interpret(
          nodesToInterpret
        );
      } catch (error) {
        if (error instanceof DirectiveError) { throw error; }
        throw new DirectiveError(`Failed to interpret imported file: ${error instanceof Error ? error.message : String(error)}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED);
      }

      // --- Log before import helper decision ---
      process.stdout.write(`\nDEBUG: Before import logic - imports: ${JSON.stringify(imports)}\n`);
      process.stdout.write(`DEBUG: Before import logic - resultState defined: ${!!resultState}\n`);
      // --- End Log ---

      if (!imports || imports.length === 0 || imports.some((i: { name: string }) => i.name === '*')) {
          if (importDirectiveLocation) {
            this.importAllVariables(resultState, targetState, importDirectiveLocation, resolvedIdentifier, currentFilePath);
          }
      } else {
          if (importDirectiveLocation) {
            this.processStructuredImports(imports, resultState, targetState, importDirectiveLocation, resolvedIdentifier, currentFilePath);
          }
      }

      if (resolvedIdentifier) {
        const normalizedIdentifier = resolvedIdentifier.replace(/\\\\/g, '/');
        this.circularityService.endImport(normalizedIdentifier);
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
      importLocation: SyntaxSourceLocation | undefined,
      sourcePath: string | undefined,
      currentFilePath: string | undefined
    ): void {
    if (!sourceState || !targetState) {
      logger.warn('Cannot import variables - null or undefined state');
      return;
    }

    try {
      const textVars = sourceState.getAllTextVars();
      process.stdout.write(`\nDEBUG: importAllVariables - textVars size: ${textVars?.size}\n`); 
      textVars.forEach((originalVar, key) => {
        process.stdout.write(`\nDEBUG: importAllVariables - Processing text key: ${key}, value: ${originalVar?.value}\n`); // Log each var
        try {
          const metadata: VariableMetadata = {
            origin: VariableOrigin.IMPORT,
            definedAt: importLocation ? { 
              line: importLocation.start.line,
              column: importLocation.start.column,
              filePath: currentFilePath ?? 'unknown'
            } : undefined,
            context: originalVar?.metadata ? { originalMetadata: originalVar.metadata } : undefined,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };
          const newVar: TextVariable = {
            type: VariableType.TEXT,
            name: key,
            value: originalVar.value,
            metadata: metadata
          };
          // --- Log before call ---
          process.stdout.write(`\nDEBUG: Calling targetState.setTextVar(${key}, ${newVar.value})\n`);
          // --- End log ---
          targetState.setTextVar(key, newVar.value);
        } catch (error) {
          logger.warn(`Failed to import text variable ${key}`, { error });
        }
      });

      const dataVars = sourceState.getAllDataVars();
      process.stdout.write(`\nDEBUG: importAllVariables - dataVars size: ${dataVars?.size}\n`); // Log map size
      dataVars.forEach((originalVar, key) => {
        process.stdout.write(`\nDEBUG: importAllVariables - Processing data key: ${key}, value: ${JSON.stringify(originalVar?.value)}\n`); // Log each var
        try {
          const valueCopy = JSON.parse(JSON.stringify(originalVar.value)) as JsonValue;
          const metadata: VariableMetadata = {
            origin: VariableOrigin.IMPORT,
            definedAt: importLocation ? { 
              line: importLocation.start.line,
              column: importLocation.start.column,
              filePath: currentFilePath ?? 'unknown'
            } : undefined,
            context: originalVar?.metadata ? { originalMetadata: originalVar.metadata } : undefined,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };
          const newVar: DataVariable = {
            type: VariableType.DATA,
            name: key,
            value: valueCopy,
            metadata: metadata
          };
          targetState.setDataVar(key, newVar.value);
        } catch (error) {
          logger.warn(`Failed to import data variable ${key}`, { error });
        }
      });

      const pathVars = sourceState.getAllPathVars();
      pathVars.forEach((originalVar, key) => {
        try {
          const metadata: VariableMetadata = {
            origin: VariableOrigin.IMPORT,
            definedAt: importLocation ? { 
              line: importLocation.start.line,
              column: importLocation.start.column,
              filePath: currentFilePath ?? 'unknown'
            } : undefined,
            context: originalVar?.metadata ? { originalMetadata: originalVar.metadata } : undefined,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };
          const newVar: IPathVariable = {
            ...originalVar,
            name: key,
            metadata: metadata
          };
          targetState.setPathVar(key, newVar.value);
        } catch (error) {
          logger.warn(`Failed to import path variable ${key}`, { error });
        }
      });

      const commands = sourceState.getAllCommands();
      commands.forEach((originalVar, key) => {
        try {
          const metadata: VariableMetadata = {
            origin: VariableOrigin.IMPORT,
            definedAt: importLocation ? { 
              line: importLocation.start.line,
              column: importLocation.start.column,
              filePath: currentFilePath ?? 'unknown'
            } : undefined,
            context: undefined,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };
          const newVar: CommandVariable = {
            type: VariableType.COMMAND,
            name: key,
            value: originalVar.value,
            metadata: metadata
          };
          targetState.setCommandVar(key, newVar.value, newVar.metadata);
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
    importLocation: SyntaxSourceLocation,
    sourcePath: string | undefined,
    currentFilePath: string | undefined
  ): void {
    for (const item of imports) {
       process.stdout.write(`\nDEBUG: processStructuredImports - Processing item: ${item.name}, Alias: ${item.alias}\n`); // Log item
      try {
        const { name, alias } = item;
        const targetName = alias || name;
        let variableFound = false;

        const textVar = sourceState.getTextVar(name);
        process.stdout.write(`\nDEBUG: processStructuredImports - Found textVar for ${name}: ${!!textVar}\n`); // Log if found
        if (textVar) {
          const metadata: VariableMetadata = {
            origin: VariableOrigin.IMPORT,
            definedAt: importLocation ? { 
              line: importLocation.start.line,
              column: importLocation.start.column,
              filePath: currentFilePath ?? 'unknown'
            } : undefined,
            context: textVar?.metadata ? { originalMetadata: textVar.metadata } : undefined,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };
          const newVar: TextVariable = { type: VariableType.TEXT, name: targetName, value: textVar.value, metadata: metadata };
          process.stdout.write(`\nDEBUG: Calling targetState.setTextVar(${targetName}, ${newVar.value})\n`); // Log before call
          targetState.setTextVar(targetName, newVar.value);
          variableFound = true;
          continue;
        }

        const dataVar = sourceState.getDataVar(name);
        if (dataVar) {
          const metadata: VariableMetadata = {
            origin: VariableOrigin.IMPORT,
            definedAt: importLocation ? { 
              line: importLocation.start.line,
              column: importLocation.start.column,
              filePath: currentFilePath ?? 'unknown'
            } : undefined,
            context: dataVar?.metadata ? { originalMetadata: dataVar.metadata } : undefined,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };
          const valueCopy = JSON.parse(JSON.stringify(dataVar.value)) as JsonValue;
          const newVar: DataVariable = { type: VariableType.DATA, name: targetName, value: valueCopy, metadata: metadata };
          targetState.setDataVar(targetName, newVar.value);
          variableFound = true;
          continue;
        }

        const pathVar = sourceState.getPathVar(name);
        if (pathVar) {
           const metadata: VariableMetadata = {
             origin: VariableOrigin.IMPORT,
             definedAt: importLocation ? { 
               line: importLocation.start.line,
               column: importLocation.start.column,
               filePath: currentFilePath ?? 'unknown'
             } : undefined,
             context: pathVar?.metadata ? { originalMetadata: pathVar.metadata } : undefined,
             createdAt: Date.now(),
             modifiedAt: Date.now(),
           };
           const newVar: IPathVariable = { ...pathVar, name: targetName, metadata: metadata };
           targetState.setPathVar(targetName, newVar.value);
           variableFound = true;
           continue;
        }

        const commandVar = sourceState.getCommand(name);
        if (commandVar) {
           const metadata: VariableMetadata = {
             origin: VariableOrigin.IMPORT,
             definedAt: importLocation ? { 
               line: importLocation.start.line,
               column: importLocation.start.column,
               filePath: currentFilePath ?? 'unknown'
             } : undefined,
             context: undefined,
             createdAt: Date.now(),
             modifiedAt: Date.now(),
           };
           targetState.setCommandVar(targetName, commandVar, metadata);
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