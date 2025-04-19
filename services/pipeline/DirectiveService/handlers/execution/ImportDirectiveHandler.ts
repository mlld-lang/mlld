import { inject, injectable } from 'tsyringe';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
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
        resolvedPath = await this.resolutionService.resolvePath(pathObject.raw, resolvePathContext);
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

      resolvedIdentifier = resolvedPath.originalValue || resolvedPath.validatedPath || pathObject.raw;

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

      // 6. Interpret Content - Commented out
      const interpreterServiceClient = this.ensureInterpreterServiceClient();
      let sourceStateChanges: StateChanges | undefined;
      logger.warn('[ImportDirectiveHandler] InterpreterService client API mismatch - Skipping variable import step.');
      /* 
      try {
         const interpretedState = await interpreterServiceClient.interpret(astNodes, { ... }, ...);
         // sourceStateChanges = extractStateChanges(interpretedState);
      } catch (interpretError) { ... }
      */
      
      // 7. Process Imports (will likely import nothing as sourceStateChanges is undefined)
      const importDirectiveLocation: SyntaxSourceLocation | undefined = location ? {
          filePath: currentFilePath ?? 'unknown',
          line: location.start.line, // Assuming location has start.line/column
          column: location.start.column
      } : undefined;

      if (importsList === '*') {
        // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Importing all variables from source state associated with ${resolvedIdentifier}\n`);
        if (sourceStateChanges) {
          this.importAllVariables(sourceStateChanges, stateChangesAccumulator, importDirectiveLocation, resolvedIdentifier, currentFilePath ?? undefined);
        } else {
           // process.stdout.write(`WARN: [ImportDirectiveHandler.handle] Skipping import * because source interpretation yielded no state changes for ${resolvedIdentifier}.\n`);
        }
      } else if (Array.isArray(importsList)) {
        // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Processing structured imports from source state associated with ${resolvedIdentifier}\n`);
        if (sourceStateChanges) {
          await this.processStructuredImports(importsList, sourceStateChanges, stateChangesAccumulator, importDirectiveLocation, resolvedIdentifier, currentFilePath ?? undefined);
      } else {
           // process.stdout.write(`WARN: [ImportDirectiveHandler.handle] Skipping structured import because source interpretation yielded no state changes for ${resolvedIdentifier}.\n`);
        }
      }

      // 8. Mark Import as Completed
        this.circularityService.endImport(normalizedIdentifier);

      if (this.debugEnabled) {
         // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] EXIT. Success. Accumulated changes: ${Object.keys(stateChangesAccumulator).length}\n`);
      }

      // Return success with accumulated state changes (if any)
      return {
        stateChanges: Object.keys(stateChangesAccumulator).length > 0 ? { variables: stateChangesAccumulator } : undefined,
        replacement: [] // Import directives generally don't replace themselves with nodes
      };

    } catch (error) {
      let errorMessage = 'Unknown error during import execution';
      let errorToThrow: DirectiveError;

      // Check if error is an object before using instanceof
      if (error && typeof error === 'object') { 
      if (error instanceof DirectiveError) {
            // If it's already a DirectiveError, use it directly
            errorToThrow = error;
            errorMessage = error.message; // Keep message consistent
          } else if (error instanceof Error) {
            // If it's a standard Error, wrap it
            errorMessage = error.message;
            errorToThrow = new DirectiveError(
              `Import directive error: ${errorMessage}`,
              this.kind,
              DirectiveErrorCode.EXECUTION_FAILED,
              { cause: error } // Keep the original Error as cause
            );
          } else {
            // Handle other object types (e.g., plain error objects from services)
            errorMessage = JSON.stringify(error);
            errorToThrow = new DirectiveError(
              `Import directive error: ${errorMessage}`,
              this.kind,
              DirectiveErrorCode.EXECUTION_FAILED,
              { cause: new Error(errorMessage) } // Create a new Error as cause
            );
          }
      } else {
         // Handle non-object errors (null, undefined, string, number, etc.)
         errorMessage = String(error); 
         errorToThrow = new DirectiveError(
           `Import directive error: ${errorMessage}`,
           this.kind,
           DirectiveErrorCode.EXECUTION_FAILED,
           { cause: new Error(errorMessage) } // Create a new Error as cause
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
      
      // Throw the unified DirectiveError
      throw errorToThrow;
    }
  }

  private importAllVariables(
      sourceStateChanges: StateChanges,
      targetStateChanges: Record<string, VariableDefinition>,
      importLocation: SyntaxSourceLocation | undefined,
      sourcePath: string | undefined,
      currentFilePath: string | undefined
    ): void {
    // process.stdout.write(`DEBUG: [ImportDirectiveHandler.importAllVariables] ENTER. Importing from StateChanges.\n`);

    if (!sourceStateChanges || !sourceStateChanges.variables) {
       // process.stdout.write(`WARN: [ImportDirectiveHandler.importAllVariables] Cannot import variables - sourceStateChanges or sourceStateChanges.variables is null or undefined\n`);
      return;
    }

    try {
      for (const [key, originalVarDef] of Object.entries(sourceStateChanges.variables)) {
         // process.stdout.write(`DEBUG: [ImportDirectiveHandler.importAllVariables] Processing var: ${key}, Type: ${originalVarDef.type}\n`);
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

          // Add to the target state changes accumulator
          targetStateChanges[key] = newVarDef;
           // process.stdout.write(`DEBUG: [ImportDirectiveHandler.importAllVariables] Copied var: ${key} to target state changes\n`);
        } catch (error) {
          process.stderr.write(`ERROR: [ImportDirectiveHandler.importAllVariables] Failed to copy var ${key}: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      }
    } catch (error) {
      // process.stdout.write(`\nERROR in importAllVariables outer try: ${error}\n`);
      logger.warn('Error during importAllVariables', { error });
    }
  }

  private async processStructuredImports(
    imports: Array<{ name: string; alias?: string | null }>,
    sourceStateChanges: StateChanges,
    targetStateChanges: Record<string, VariableDefinition>,
    importLocation: SyntaxSourceLocation | undefined,
    sourcePath: string | undefined,
    currentFilePath: string | undefined
  ): Promise<void> {
    // process.stdout.write(`DEBUG: [ImportDirectiveHandler.processStructuredImports] ENTER. Importing from StateChanges. Import count: ${imports.length}\n`);

     if (!sourceStateChanges || !sourceStateChanges.variables) {
       // process.stdout.write(`WARN: [ImportDirectiveHandler.processStructuredImports] Cannot import variables - sourceStateChanges or sourceStateChanges.variables is null or undefined\n`);
      return;
    }

    for (const item of imports) {
      // process.stdout.write(`DEBUG: [ImportDirectiveHandler.processStructuredImports] Processing item: ${item.name} (alias: ${item.alias ?? 'none'})\n`);
      try {
        const { name, alias } = item;
        const targetName = alias || name;

        const originalVarDef = sourceStateChanges.variables[name];

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

          // Add to the target state changes accumulator using the target name (alias or original)
          targetStateChanges[targetName] = newVarDef;
           // process.stdout.write(`DEBUG: [ImportDirectiveHandler.processStructuredImports] Copied var ${name} as ${targetName} to target state changes\n`);
           } else {
           // process.stdout.write(`WARN: [ImportDirectiveHandler.processStructuredImports] Variable "${name}" not found in source state changes for structured import.\n`);
        }
      } catch (error) {
         process.stderr.write(`ERROR: [ImportDirectiveHandler.processStructuredImports] Failed to import variable ${item.name} as ${item.alias || item.name}: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  }
}