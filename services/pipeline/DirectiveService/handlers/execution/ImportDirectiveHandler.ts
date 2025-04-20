import { inject, injectable } from 'tsyringe';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { DirectiveProcessingContext } from '@core/types/index.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { DirectiveNode } from '@core/syntax/types';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { parse } from '@core/ast';
import type { MeldNode } from '@core/syntax/types';
import { NodeType, StructuredPath } from '@core/syntax/types/nodes.js';
import { SourceLocation as SyntaxSourceLocation, JsonValue } from '@core/types/common';
import { VariableOrigin, VariableType, VariableMetadata, IPathVariable, CommandVariable, TextVariable, DataVariable, MeldVariable, VariableDefinition } from '@core/types/variables';
import { createTextVariable, createDataVariable, createPathVariable, createCommandVariable } from '@core/types/variables';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import logger from '@core/utils/logger.js';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { MeldPath, PathContentType, ValidatedResourcePath } from '@core/types/paths';
import type { StateServiceLike } from '@core/shared-service-types.js';
import { MeldResolutionError, MeldFileNotFoundError } from '@core/errors';

/**
 * Handler for @import directives
 * Imports variables from other Meld files
 */
@injectable()
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

  async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    // ---> Log Entry <-----
    process.stdout.write(`DEBUG [ImportHandler.handle ENTER] Node Kind: ${context.directiveNode?.directive?.kind}\n`);

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
      try {
        // Revert: Pass the whole pathObject
        resolvedPath = await this.resolutionService.resolvePath(pathObject, resolvePathContext);
      } catch (resolutionError) {
        // Handle potential non-Error rejections
        const cause = resolutionError instanceof Error ? resolutionError : new Error(String(resolutionError));
          throw new DirectiveError(
          `Failed to resolve import path/identifier: ${pathObject.raw}. ${cause.message}`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
          { cause: cause }
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

      // 6. Interpret Content - Now Active
      const interpreterServiceClient = this.ensureInterpreterServiceClient();
      let sourceStateChanges: StateChanges | undefined;
      // logger.warn('[ImportDirectiveHandler] InterpreterService client API mismatch - Skipping variable import step.'); // REMOVED Warning

      try {
        // Create a new child state for the imported content
        if (!sourceContextPath) {
           throw new Error('sourceContextPath is missing for interpretation');
        }
        
        // Create child state without options initially
        const childState = await currentStateService.createChildState();
        // Set the file path on the new child state
        childState.setCurrentFilePath(sourceContextPath.validatedPath);

        // Log the state creation for debugging
        // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Created child state ID: ${childState.getId()}, Path: ${childState.getCurrentFilePath()?.originalValue ?? 'N/A'}\\n`);

        // ---> Log Before Interpret <-----
        process.stdout.write(`DEBUG [ImportHandler.handle PRE-INTERPRET] Interpreting AST for: ${resolvedIdentifier}\n`);
        // Interpret the parsed nodes using the child state
        // Call 'interpret' with nodes, options (undefined for now), and the initial childState
        const interpretedChildState: StateServiceLike = await interpreterServiceClient.interpret(astNodes, 
          undefined, // Pass undefined for options, as InterpreterOptionsBase doesn't have transformationMode
          childState // Pass childState as the initial state
        );

        // --- DEBUG LOGGING START ---
        process.stdout.write(`DEBUG [ImportHandler]: Interpreted State ID: ${interpretedChildState.getStateId ? interpretedChildState.getStateId() : 'N/A'}\n`);
        // --- DEBUG LOGGING END ---

        // Construct StateChanges manually from the resulting state's variables
        const allVars = {
          text: interpretedChildState.getAllTextVars(),
          data: interpretedChildState.getAllDataVars(),
          path: interpretedChildState.getAllPathVars(),
          command: interpretedChildState.getAllCommands(),
        };

        // --- DEBUG LOGGING START ---
        process.stdout.write(`DEBUG [ImportHandler]: Type of allVars.text: ${typeof allVars.text}, isMap: ${allVars.text instanceof Map}\n`);
        process.stdout.write(`DEBUG [ImportHandler]: allVars.text keys: ${allVars.text ? JSON.stringify(Array.from(allVars.text.keys())) : 'undefined'}\n`);
        process.stdout.write(`DEBUG [ImportHandler]: Type of allVars.data: ${typeof allVars.data}, isMap: ${allVars.data instanceof Map}\n`);
        process.stdout.write(`DEBUG [ImportHandler]: allVars.data keys: ${allVars.data ? JSON.stringify(Array.from(allVars.data.keys())) : 'undefined'}\n`);
        // --- DEBUG LOGGING END ---

        const accumulatedVariables: Record<string, VariableDefinition> = {};
        // Combine all variable types into the StateChanges format
        for (const [key, value] of allVars.text.entries()) {
          accumulatedVariables[key] = value;
        }
        for (const [key, value] of allVars.data.entries()) {
          accumulatedVariables[key] = value;
        }
        for (const [key, value] of allVars.path.entries()) {
          accumulatedVariables[key] = value;
        }
        for (const [key, value] of allVars.command.entries()) {
          accumulatedVariables[key] = value;
        }

        // --- DEBUG LOGGING START ---
        process.stdout.write(`DEBUG [ImportHandler]: Accumulated variable keys: ${JSON.stringify(Object.keys(accumulatedVariables))}\n`);
        // --- DEBUG LOGGING END ---

        if (Object.keys(accumulatedVariables).length > 0) {
           sourceStateChanges = { variables: accumulatedVariables };
        } else {
            sourceStateChanges = undefined;
            logger.warn(`[ImportDirectiveHandler] Interpretation of ${resolvedIdentifier} completed, but no variables were found in the resulting state. Import will be empty.`);
        }
        // ---> Log sourceStateChanges before passing to helpers
        process.stdout.write(`DEBUG [ImportHandler]: Constructed sourceStateChanges: ${JSON.stringify(sourceStateChanges)}\n`);

      } catch (interpretError) {
        const cause = interpretError instanceof Error ? interpretError : new Error(String(interpretError));
        throw new DirectiveError(
          `Failed to interpret imported content from ${resolvedIdentifier}. ${cause.message}`,
          this.kind,
          DirectiveErrorCode.EXECUTION_FAILED,
          { cause }
        );
      }

      // 7. Process Imports (Using extracted sourceStateChanges)
      const importDirectiveLocation: SyntaxSourceLocation | undefined = location ? {
          filePath: currentFilePath ?? 'unknown',
          line: location.start.line, // Assuming location has start.line/column
          column: location.start.column
      } : undefined;

      let accumulatedStateChanges: Record<string, VariableDefinition> = {};

      // Check for the specific array case [{ name: '*' }] first
      if (Array.isArray(importsList) && importsList.length === 1 && importsList[0].name === '*' && importsList[0].alias == null) {
        if (sourceStateChanges) {
          // Treat [{ name: '*' }] the same as importsList === '*'
          accumulatedStateChanges = this.importAllVariables(sourceStateChanges, importDirectiveLocation, resolvedIdentifier, currentFilePath ?? undefined);
          process.stdout.write(`DEBUG [ImportHandler]: (Array *) Received from importAllVariables: ${JSON.stringify(accumulatedStateChanges)}\n`);
        } else {
           logger.warn(`[ImportDirectiveHandler.handle] Skipping import * (array format) because source interpretation yielded no state changes for ${resolvedIdentifier}.\n`);
        }
      } else if (importsList === '*') { // Handle the simple string case
        if (sourceStateChanges) {
          accumulatedStateChanges = this.importAllVariables(sourceStateChanges, importDirectiveLocation, resolvedIdentifier, currentFilePath ?? undefined);
          process.stdout.write(`DEBUG [ImportHandler]: (String *) Received from importAllVariables: ${JSON.stringify(accumulatedStateChanges)}\n`);
        } else {
           logger.warn(`[ImportDirectiveHandler.handle] Skipping import * (string format) because source interpretation yielded no state changes for ${resolvedIdentifier}.\n`);
        }
      } else if (Array.isArray(importsList)) { // Handle named imports
        if (sourceStateChanges) {
          accumulatedStateChanges = await this.processStructuredImports(importsList, sourceStateChanges, importDirectiveLocation, resolvedIdentifier, currentFilePath ?? undefined);
          process.stdout.write(`DEBUG [ImportHandler]: Received from processStructuredImports: ${JSON.stringify(accumulatedStateChanges)}\n`);
        } else {
           logger.warn(`[ImportDirectiveHandler.handle] Skipping structured import because source interpretation yielded no state changes for ${resolvedIdentifier}.\n`);
        }
      }

      // 8. Mark Import as Completed
        this.circularityService.endImport(normalizedIdentifier);

      if (this.debugEnabled) {
         logger.debug(`[ImportDirectiveHandler.handle] EXIT. Success. Accumulated changes: ${Object.keys(accumulatedStateChanges).length}\n`);
      }

      // Return success with accumulated state changes (if any)
      // const finalStateChanges = Object.keys(accumulatedStateChanges).length > 0 ? { variables: accumulatedStateChanges } : undefined; // No longer needed
      // process.stdout.write(`DEBUG [ImportHandler.handle RETURN] finalStateChanges defined: ${!!finalStateChanges}, keys: ${finalStateChanges ? JSON.stringify(Object.keys(finalStateChanges.variables)) : 'N/A'}\n`);
      process.stdout.write(`DEBUG [ImportHandler.handle RETURN] Accumulated keys: ${JSON.stringify(Object.keys(accumulatedStateChanges))}\n`);
      
      const result: DirectiveResult = {
        stateChanges: { variables: accumulatedStateChanges }, // Use the result from helper functions
        replacement: [] 
      };
      return result;

    } catch (error) {
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
      if (resolvedIdentifier) {
        try {
          const normalizedIdentifier = resolvedIdentifier.replace(/\\/g, '/'); // Use original normalization
          this.circularityService.endImport(normalizedIdentifier);
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
    process.stdout.write(`DEBUG [importAllVariables]: ENTER. sourceStateChanges.variables: ${JSON.stringify(sourceStateChanges?.variables)}\n`);
    const targetStateChanges: Record<string, VariableDefinition> = {}; 

    if (!sourceStateChanges || !sourceStateChanges.variables) {
      logger.warn(`[ImportDirectiveHandler.importAllVariables] Cannot import variables - sourceStateChanges or sourceStateChanges.variables is null or undefined`);
      return targetStateChanges; // Return empty map
    }

    try {
      for (const [key, originalVarDef] of Object.entries(sourceStateChanges.variables)) {
         // ---> Log loop iteration
         process.stdout.write(`DEBUG [importAllVariables]: Processing key: ${key}, Def: ${JSON.stringify(originalVarDef)}\n`);
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
    process.stdout.write(`DEBUG [importAllVariables]: RETURN. targetStateChanges: ${JSON.stringify(targetStateChanges)}\n`);
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
    process.stdout.write(`DEBUG [processStructuredImports]: ENTER. sourceStateChanges.variables: ${JSON.stringify(sourceStateChanges?.variables)}\n`);
    const targetStateChanges: Record<string, VariableDefinition> = {}; 

     if (!sourceStateChanges || !sourceStateChanges.variables) {
      logger.warn(`[ImportDirectiveHandler.processStructuredImports] Cannot import variables - sourceStateChanges or sourceStateChanges.variables is null or undefined`);
      return targetStateChanges; // Return empty map
    }

    for (const item of imports) {
      // ---> Log loop iteration
      process.stdout.write(`DEBUG [processStructuredImports]: Processing item: ${JSON.stringify(item)}\n`);
      try {
        const { name, alias } = item;
        const targetName = alias || name;

        const originalVarDef = sourceStateChanges.variables[name];
        // ---> Log found definition
        process.stdout.write(`DEBUG [processStructuredImports]: Found originalVarDef for ${name}: ${JSON.stringify(originalVarDef)}\n`);

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
    process.stdout.write(`DEBUG [processStructuredImports]: RETURN. targetStateChanges: ${JSON.stringify(targetStateChanges)}\n`);
    return targetStateChanges; // Return the populated map
  }
}