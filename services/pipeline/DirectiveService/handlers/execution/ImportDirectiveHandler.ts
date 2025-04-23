import { inject, injectable } from 'tsyringe';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import { DirectiveProcessingContext } from '@core/types';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { DirectiveNode } from '@core/syntax/types';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { IStateService } from '@services/state/StateService/IStateService';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { IParserService } from '@services/pipeline/ParserService/IParserService';
import { parse } from '@core/ast';
import type { MeldNode } from '@core/syntax/types';
import { NodeType, StructuredPath } from '@core/syntax/types/nodes';
import { SourceLocation as SyntaxSourceLocation, JsonValue } from '@core/types/common';
import { VariableOrigin, VariableType, VariableMetadata, IPathVariable, CommandVariable, TextVariable, DataVariable, MeldVariable, VariableDefinition } from '@core/types/variables';
import { createTextVariable, createDataVariable, createPathVariable, createCommandVariable } from '@core/types/variables';
import { IPathService } from '@services/fs/PathService/IPathService';
import { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import logger from '@core/utils/logger';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver';
import { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import { StateService } from '@services/state/StateService/StateService';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { MeldPath, PathContentType, ValidatedResourcePath } from '@core/types/paths';
import type { StateServiceLike } from '@core/shared-service-types';
import { MeldResolutionError, MeldFileNotFoundError, MeldError } from '@core/errors';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import crypto from 'crypto';
import { TextNodeFactory } from '@core/syntax/types/factories/TextNodeFactory';

/**
 * Handler for @import directives
 * Imports variables from other Meld files
 */
@injectable()
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';
  private debugEnabled: boolean = false;
  private stateTrackingService?: IStateTrackingService;
  private interpreterServiceClient: IInterpreterServiceClient;

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IStateService') private stateService: IStateService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService,
    @inject('IParserService') private parserService: IParserService,
    @inject('IPathService') private pathService: IPathService,
    @inject('ICircularityService') private circularityService: ICircularityService,
    @inject(InterpreterServiceClientFactory) private interpreterServiceClientFactory: InterpreterServiceClientFactory,
    @inject('IURLContentResolver') private urlContentResolver?: IURLContentResolver,
    @inject('StateTrackingService') stateTrackingService?: IStateTrackingService,
    @inject(TextNodeFactory) private textNodeFactory?: TextNodeFactory
  ) {
    const factoryContainerId = (this.interpreterServiceClientFactory as any)?.container?.id || 'factory-container-not-found';
    process.stdout.write(`DEBUG [ImportDirectiveHandler CONSTRUCTOR] Factory Container ID: ${factoryContainerId}\n`);
    this.interpreterServiceClient = this.interpreterServiceClientFactory.createClient();
    this.debugEnabled = false;
    if (stateTrackingService) {
      this.stateTrackingService = stateTrackingService;
      this.debugEnabled = !!stateTrackingService && process.env.MELD_DEBUG === 'true';
    }
  }

  async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    // ---> Log Entry <-----
    process.stdout.write(`DEBUG [ImportHandler.handle ENTER] Node Kind: ${context.directiveNode?.directive?.kind}\n`);
    process.stdout.write(`DEBUG [ImportHandler.handle] CircularityService stack: ${JSON.stringify((this.circularityService as any)?._importStack || [])}\n`);

    const { directiveNode: baseNode, state: currentStateService, resolutionContext: inputResolutionContext } = context;
    const node = baseNode as DirectiveNode;
    const location = node.location;
    const currentFilePath = currentStateService.getCurrentFilePath() ?? undefined;

    if (this.debugEnabled) {
      // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] ENTER. Node: ${JSON.stringify(node)}, Context Path: ${currentFilePath ?? 'N/A'}\n`);
    }

    let resolvedIdentifier: string | undefined;
    let resolvedPath: MeldPath | undefined;
    let errorObj: DirectiveError | undefined;

    const stateChangesAccumulator: Record<string, VariableDefinition> = {};

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // Access directive data correctly
      if (!node.directive || node.directive.kind !== 'import') {
         throw new DirectiveError('Invalid node type passed to ImportDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED);
      }
      const importDirectiveData = node.directive as any; 
      const pathObject = importDirectiveData.path as StructuredPath | undefined;
      const importsList = importDirectiveData.imports as '*' | Array<{ name: string; alias?: string | null }> | undefined;

      if (!pathObject?.raw) {
         throw new DirectiveError('Import directive missing path or path is invalid', this.kind, DirectiveErrorCode.VALIDATION_FAILED);
      }

      // 2. Resolve the path/identifier
      const resolvePathContext = ResolutionContextFactory.create(currentStateService, currentFilePath);
      let resolvedPathString: string | undefined;
      try {
        // --- Step 1: Resolve the path object/string to a string ---
        resolvedPathString = await this.resolutionService.resolveInContext(pathObject, resolvePathContext);

        // --- Step 2: Validate the resolved string and get MeldPath ---
        // Check if resolvedPathString is empty before validating
        if (!resolvedPathString) {
          throw new MeldResolutionError(`Path resolved to an empty string for input: ${pathObject.raw}`, { 
              code: 'E_RESOLVE_EMPTY_PATH', 
              details: { originalPath: pathObject.raw }
          });
        }
        resolvedPath = await this.resolutionService.resolvePath(resolvedPathString, resolvePathContext);

      } catch (resolutionError) {
        // Handle potential non-Error rejections
        const cause = resolutionError instanceof Error ? resolutionError : new Error(String(resolutionError));
        // Include the potentially resolved string in the error if available
        const pathForError = resolvedPathString !== undefined ? resolvedPathString : pathObject.raw;
        throw new DirectiveError(
          `Failed to resolve import path/identifier: ${pathForError}. ${cause.message}`,
          this.kind,
          DirectiveErrorCode.RESOLUTION_FAILED,
          { cause }
        );
      }

      // Prioritize validated path for the identifier used internally
      resolvedIdentifier = resolvedPath.validatedPath || resolvedPath.originalValue || pathObject.raw;

      if (!resolvedIdentifier) {
        throw new DirectiveError(
          `Resolved import path/identifier is empty for input: ${pathObject.raw}`,
          this.kind,
          DirectiveErrorCode.RESOLUTION_FAILED
        );
      }

      // 3. Circularity Check
      const normalizedIdentifier = resolvedIdentifier.replace(/\\/g, '/'); // Normalize for consistency

      this.circularityService.beginImport(normalizedIdentifier);

      // 4. Get Content (File or URL)
      let content: string | undefined;
      let sourceStateId: string | undefined; // State ID for the context of the imported content
      let sourceContextPath: MeldPath | undefined; // Context path for the imported file

      if (resolvedPath.contentType === PathContentType.URL && this.urlContentResolver) {
        // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Importing from URL: ${resolvedIdentifier}\n`);
        const urlResponse = await this.urlContentResolver.fetchURL(resolvedPath.validatedPath, {});
        content = urlResponse.content;
        sourceStateId = `url:${resolvedIdentifier}`; // Create a unique state ID for URL content
        sourceContextPath = resolvedPath; // Use the resolved URL path as context
      } else if (resolvedPath.contentType === PathContentType.FILESYSTEM) {
        // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Importing from file: ${resolvedIdentifier}\n`);
        
        // --- ADD Exists Check --- 
        const fileExists = await this.fileSystemService.exists(resolvedPath.validatedPath);
        if (!fileExists) {
            // Include the resolved path string in the error message
            const errorMsg = `Import file not found: ${resolvedPath.validatedPath}`;
            throw new DirectiveError(
                errorMsg,
                this.kind,
                DirectiveErrorCode.FILE_NOT_FOUND,
                { node: node, context: context } // Standard details
            );
        }
        // --- End Exists Check --- 
        
        content = await this.fileSystemService.readFile(resolvedPath.validatedPath);
        sourceStateId = `file:${resolvedIdentifier}`;
        // Use the resolved MeldPath directly as the source context path
        sourceContextPath = resolvedPath; 
      } else {
        throw new DirectiveError(
          `Unsupported import type or missing resolver for path: ${resolvedIdentifier}`,
          this.kind,
          DirectiveErrorCode.EXECUTION_FAILED
        );
      }

      if (content === undefined) {
        throw new DirectiveError(
          `Could not retrieve content for import: ${resolvedIdentifier}`,
          this.kind,
          DirectiveErrorCode.EXECUTION_FAILED
        );
      }

      // 5. Parse Content 
      const astNodes = await this.parserService.parse(content) as MeldNode[]; // Expect MeldNode[] directly
      process.stdout.write(`DEBUG [ImportHandler]: Parsed ${astNodes.length} nodes from ${resolvedIdentifier}\n`);
      
      // Check if the result is a valid array
      if (!Array.isArray(astNodes)) { 
         const errorMsg = `Parsing did not return a valid AST node array. Received: ${typeof astNodes}`;
         throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.EXECUTION_FAILED); 
      }
      
      // Check if array is empty (could indicate failure or just empty file)
      if (astNodes.length === 0) {
          logger.debug(`Parsed content resulted in an empty AST array for ${resolvedIdentifier}.`);
          // Decide if this is an error or okay. For now, treat as okay, import nothing.
      }

      // 6. Interpret Content
      let sourceStateChanges: StateChanges | undefined;
      try {
        // Before creating child state, get a reference to the CircularityService for tracking
        process.stdout.write(`DEBUG [ImportHandler]: Before creating child state, CircularityService stack size: ${(this.circularityService as any)?._importStack?.length || 'unknown'}\n`);
        
        const childState = await currentStateService.createChildState();
        if (sourceContextPath) {
          childState.setCurrentFilePath(sourceContextPath.validatedPath);
        }
        
        // Direct sanity check on child state parent relationship
        process.stdout.write(`DEBUG [ImportHandler]: Created child state with ID: ${childState.getStateId()}, Has parent? ${!!childState.getParentState()}, Parent matches? ${childState.getParentState() === currentStateService}\n`);

        process.stdout.write(`DEBUG [ImportHandler]: BEFORE interpret call for ${resolvedPath.validatedPath}\n`);
        
        // CRITICAL FIX: Begin tracking this import in the circularity service BEFORE interpretation
        // This ensures the import stack is updated correctly before recursive imports
        this.circularityService.beginImport(resolvedPath.validatedPath);
        process.stdout.write(`DEBUG [ImportHandler]: AFTER beginImport, stack: ${JSON.stringify((this.circularityService as any)?._importStack || [])}\n`);
        
        let interpretedState;
        try {
          interpretedState = await this.interpreterServiceClient!.interpret(
            astNodes, 
            { 
              filePath: resolvedPath.validatedPath, 
              mergeState: false, 
            }, 
            childState,
            this.circularityService  // Pass the circularity service to maintain import stack
          );
          
          // Only end the import if interpretation completes successfully
          this.circularityService.endImport(resolvedPath.validatedPath);
          process.stdout.write(`DEBUG [ImportHandler]: AFTER endImport, stack: ${JSON.stringify((this.circularityService as any)?._importStack || [])}\n`);
        } catch (error) {
          // Clean up the import stack even if interpretation fails
          this.circularityService.endImport(resolvedPath.validatedPath);
          process.stdout.write(`DEBUG [ImportHandler]: AFTER error endImport, stack: ${JSON.stringify((this.circularityService as any)?._importStack || [])}\n`);
          throw error;
        }
        process.stdout.write(`DEBUG [ImportHandler]: AFTER interpret call for ${resolvedPath.validatedPath} (resolved)\n`);

        sourceStateChanges = { variables: interpretedState.getLocalChanges() };

      } catch (interpretErrorCaught) { 
        process.stdout.write(`DEBUG [ImportHandler]: CAUGHT error during interpret for ${resolvedPath.validatedPath}: ${interpretErrorCaught}\n`);
        const cause = interpretErrorCaught instanceof Error ? interpretErrorCaught : new Error(String(interpretErrorCaught));
        // Construct and throw the DirectiveError directly
        const directiveError = new DirectiveError(
          `Failed to interpret imported content from ${resolvedPath.validatedPath}. ${cause.message}`,
          this.kind,
          DirectiveErrorCode.EXECUTION_FAILED,
          { cause }
        );
        process.stdout.write(`DEBUG [ImportHandler]: Re-throwing DIRECTLY: ${directiveError.message}\n`);
        throw directiveError; // Throw directly
      }

      // 7. Process Imports (This section should NOT be reached if interpret throws)
      const importDirectiveLocation: SyntaxSourceLocation | undefined = location ? {
          filePath: currentFilePath ?? 'unknown',
          line: location.start.line,
          column: location.start.column
      } : undefined;

      let accumulatedStateChanges: Record<string, VariableDefinition> = {};

      // Check for the specific array case [{ name: '*' }] first
      if (Array.isArray(importsList) && importsList.length === 1 && importsList[0].name === '*' && importsList[0].alias == null) {
        if (sourceStateChanges) {
          // Treat [{ name: '*' }] the same as importsList === '*'
          accumulatedStateChanges = this.importAllVariables(sourceStateChanges, importDirectiveLocation, resolvedPath.validatedPath, currentFilePath ?? undefined);
          // process.stdout.write(`DEBUG [ImportHandler]: (Array *) Received from importAllVariables: ${JSON.stringify(accumulatedStateChanges)}\n`);
        } else {
           logger.warn(`[ImportDirectiveHandler.handle] Skipping import * (array format) because source interpretation yielded no state changes for ${resolvedPath.validatedPath}.\n`);
        }
      } else if (importsList === '*') { // Handle the simple string case
        if (sourceStateChanges) {
          accumulatedStateChanges = this.importAllVariables(sourceStateChanges, importDirectiveLocation, resolvedPath.validatedPath, currentFilePath ?? undefined);
          // process.stdout.write(`DEBUG [ImportHandler]: (String *) Received from importAllVariables: ${JSON.stringify(accumulatedStateChanges)}\n`);
        } else {
           logger.warn(`[ImportDirectiveHandler.handle] Skipping import * (string format) because source interpretation yielded no state changes for ${resolvedPath.validatedPath}.\n`);
        }
      } else if (Array.isArray(importsList)) { // Handle named imports
        if (sourceStateChanges) {
          accumulatedStateChanges = await this.processStructuredImports(importsList, sourceStateChanges, importDirectiveLocation, resolvedPath.validatedPath, currentFilePath ?? undefined);
          // process.stdout.write(`DEBUG [ImportHandler]: Received from processStructuredImports: ${JSON.stringify(accumulatedStateChanges)}\n`);
        } else {
           logger.warn(`[ImportDirectiveHandler.handle] Skipping structured import because source interpretation yielded no state changes for ${resolvedPath.validatedPath}.\n`);
        }
      }

      // 8. Mark Import as Completed
        this.circularityService.endImport(resolvedPath.validatedPath);

      if (this.debugEnabled) {
         logger.debug(`[ImportDirectiveHandler.handle] EXIT. Success. Accumulated changes: ${Object.keys(accumulatedStateChanges).length}\n`);
      }

      // Return success with accumulated state changes (if any)
      process.stdout.write(`DEBUG [ImportHandler.handle RETURN] Accumulated keys: ${JSON.stringify(Object.keys(accumulatedStateChanges))}\n`);
      
      // Create replacement based on transformation mode OR default to empty array
      let replacementNodes: MeldNode[] = []; // Default to empty array
      // if (currentStateService.isTransformationEnabled()) {
      //   // Import directives themselves don't produce output, so the replacement
      //   // in transformation mode should be an empty array, not an empty text node.
      //   replacementNodes = []; 
      // }
      // No need for the else/implicit undefined case now.

      const result: DirectiveResult = {
        stateChanges: { variables: accumulatedStateChanges }, 
        replacement: replacementNodes // Always return [] for imports
      };
      process.stdout.write(`DEBUG [ImportHandler]: ABOUT TO RETURN result: ${JSON.stringify(result)}\n`);
      return result;

    } catch (error) {
      process.stdout.write(`DEBUG [ImportHandler]: OUTER CATCH block reached. Error: ${error}\n`);
      let errorMessage = 'Unknown error during import execution';
      let errorToThrow: DirectiveError;

      // Check if error is an object before using instanceof
      if (error && typeof error === 'object') { 
      if (error instanceof DirectiveError) {
            // If it's already a DirectiveError, re-throw it directly
            // The specific code (e.g., FILE_NOT_FOUND) will be preserved.
            errorToThrow = error;
            // No need to update errorMessage here, the original message is kept.
          } else if (error instanceof Error) {
            // If it's a standard Error, wrap it. Try to infer code.
            errorMessage = error.message;
            let specificCode = DirectiveErrorCode.EXECUTION_FAILED;
            // Add checks for specific error types that should map to specific codes
            if (error instanceof MeldResolutionError || error.name === 'MeldResolutionError') {
               specificCode = DirectiveErrorCode.RESOLUTION_FAILED;
            } else if (error instanceof MeldFileNotFoundError || error.name === 'MeldFileNotFoundError') { // Assuming MeldFileNotFoundError exists
               specificCode = DirectiveErrorCode.FILE_NOT_FOUND;
            } else if (error instanceof MeldError && error.code === 'CIRCULAR_IMPORT') {
               specificCode = DirectiveErrorCode.CIRCULAR_REFERENCE;
            } // Add more checks here if needed (e.g., for PathValidationError)
            
            errorToThrow = new DirectiveError(
              `Import directive error: ${errorMessage}`,
              this.kind,
              specificCode, // Use inferred or fallback code
              { cause: error }
            );
          } else {
            // Handle other object types (e.g., plain error objects from services)
            errorMessage = JSON.stringify(error);
            errorToThrow = new DirectiveError(
              `Import directive error: ${errorMessage}`,
              this.kind,
              DirectiveErrorCode.EXECUTION_FAILED,
              { cause: new Error(errorMessage) }
            );
          }
      } else {
         // Handle non-object errors (null, undefined, string, number, etc.)
         errorMessage = String(error); 
         errorToThrow = new DirectiveError(
           `Import directive error: ${errorMessage}`,
           this.kind,
           DirectiveErrorCode.EXECUTION_FAILED,
           { cause: new Error(errorMessage) }
         );
      }

      // Cleanup: End import tracking if an identifier was resolved
      if (resolvedPath) {
        try {
          this.circularityService.endImport(resolvedPath.validatedPath);
        } catch (cleanupError) {
          logger.warn('Error during import cleanup on error path', { error: cleanupError });
        }
      }
      
      // Throw the original DirectiveError or the newly wrapped one
      throw errorToThrow;
    }
  }

  private importAllVariables(
      sourceStateChanges: StateChanges,
      importLocation: SyntaxSourceLocation | undefined,
      sourcePath: string | undefined,
      currentFilePath: string | undefined
    ): Record<string, VariableDefinition> { 
    // ---> Log entry and input
    // process.stdout.write(`DEBUG [importAllVariables]: ENTER. sourceStateChanges.variables: ${JSON.stringify(sourceStateChanges?.variables)}\n`);
    const targetStateChanges: Record<string, VariableDefinition> = {}; 

    if (!sourceStateChanges || !sourceStateChanges.variables) {
      logger.warn(`[ImportDirectiveHandler.importAllVariables] Cannot import variables - sourceStateChanges or sourceStateChanges.variables is null or undefined`);
      return targetStateChanges; // Return empty map
    }

    try {
      for (const [key, originalVarDef] of Object.entries(sourceStateChanges.variables)) {
         // ---> Log loop iteration
         // process.stdout.write(`DEBUG [importAllVariables]: Processing key: ${key}, Def: ${JSON.stringify(originalVarDef)}\n`);
        try {
          // Create new metadata for the imported variable
          const metadata: VariableMetadata = {
            origin: VariableOrigin.IMPORT,
            definedAt: importLocation,
            context: {
              originalMetadata: originalVarDef.metadata,
              sourcePath: sourcePath // File/URL where the variable originally came from
            },
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };

          // Create the variable structure directly
          const newVarDef: VariableDefinition = {
            type: originalVarDef.type,
            value: originalVarDef.value, 
            metadata: metadata,
          };

          // Add to the local state changes accumulator
          targetStateChanges[key] = newVarDef;
           // process.stdout.write(`DEBUG: [ImportDirectiveHandler.importAllVariables] Copied var: ${key} to target state changes\n`);
        } catch (error) {
          process.stderr.write(`ERROR: [ImportDirectiveHandler.importAllVariables] Failed to copy var ${key}: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      }
    } catch (error) {
      logger.warn('Error during importAllVariables outer try', { error });
    }
    // ---> Log return value
    // process.stdout.write(`DEBUG [importAllVariables]: RETURN. targetStateChanges: ${JSON.stringify(targetStateChanges)}\n`);
    return targetStateChanges; // Return the populated map
  }

  private async processStructuredImports(
    imports: Array<{ name: string; alias?: string | null }>,
    sourceStateChanges: StateChanges,
    importLocation: SyntaxSourceLocation | undefined,
    sourcePath: string | undefined,
    currentFilePath: string | undefined
  ): Promise<Record<string, VariableDefinition>> { 
    // ---> Log entry and input
    // process.stdout.write(`DEBUG [processStructuredImports]: ENTER. sourceStateChanges.variables: ${JSON.stringify(sourceStateChanges?.variables)}\n`);
    const targetStateChanges: Record<string, VariableDefinition> = {}; 

     if (!sourceStateChanges || !sourceStateChanges.variables) {
      logger.warn(`[ImportDirectiveHandler.processStructuredImports] Cannot import variables - sourceStateChanges or sourceStateChanges.variables is null or undefined`);
      return targetStateChanges; // Return empty map
    }

    // Add logging for the source variables being processed
    process.stdout.write(`DEBUG [processStructuredImports]: Processing ${Object.keys(sourceStateChanges.variables).length} variables from source state against ${imports.length} requested imports...\n`);

    for (const item of imports) {
      // ---> Log loop iteration
      // process.stdout.write(`DEBUG [processStructuredImports]: Processing item: ${JSON.stringify(item)}\n`);
      try {
        const { name, alias } = item;
        const targetName = alias || name;

        const originalVarDef = sourceStateChanges.variables[name];
        // ---> Log found definition
        // process.stdout.write(`DEBUG [processStructuredImports]: Found originalVarDef for ${name}: ${JSON.stringify(originalVarDef)}\n`);

        if (originalVarDef) {
          // Create new metadata
          const metadata: VariableMetadata = {
            origin: VariableOrigin.IMPORT,
            definedAt: importLocation,
            context: {
              originalMetadata: originalVarDef.metadata,
              sourcePath: sourcePath // File/URL where the variable originally came from
            },
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };

          // Create the variable structure directly
          const newVarDef: VariableDefinition = {
            type: originalVarDef.type,
            value: originalVarDef.value, 
            metadata: metadata,
          };

          // Add to the local state changes accumulator using the target name (alias or original)
          targetStateChanges[targetName] = newVarDef;
           // process.stdout.write(`DEBUG: [ImportDirectiveHandler.processStructuredImports] Copied var ${name} as ${targetName} to target state changes\n`);
           } else {
           logger.warn(`[ImportDirectiveHandler.processStructuredImports] Variable "${name}" not found in source state changes for structured import.`);
        }
      } catch (error) {
         process.stderr.write(`ERROR: [ImportDirectiveHandler.processStructuredImports] Failed to import variable ${item.name} as ${item.alias || item.name}: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    // ---> Log return value
    // process.stdout.write(`DEBUG [processStructuredImports]: RETURN. targetStateChanges: ${JSON.stringify(targetStateChanges)}\n`);
    return targetStateChanges; // Return the populated map
  }
}