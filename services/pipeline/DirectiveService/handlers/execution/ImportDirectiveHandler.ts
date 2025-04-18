import { inject, injectable } from 'tsyringe';
import { IDirectiveHandler, DirectiveProcessingContext, DirectiveResult, DirectiveError, DirectiveErrorCode, StateChanges } from '@core/directives/DirectiveHandler';
import { ImportDirectiveNode } from '@core/ast/nodes/directives/ImportDirectiveNode';
import { IValidationService } from '@core/services/validation/IValidationService';
import { IResolutionService } from '@core/services/resolution/IResolutionService';
import { IStateService } from '@core/services/state/IStateService';
import { IFileSystemService } from '@core/services/filesystem/IFileSystemService';
import { IParserService } from '@core/services/parser/IParserService';
import { Node } from '@core/ast/nodes/Node';
import { StructuredPath } from '@core/model/StructuredPath';
import { SourceLocation as SyntaxSourceLocation, JsonValue } from '@core/types/common';
import { VariableOrigin, VariableType, VariableMetadata, IPathVariable, CommandVariable, TextVariable, DataVariable, VariableDefinition, SerializableVariableValue } from '@core/types/variables';
import { createTextVariable, createDataVariable, createPathVariable, createCommandVariable } from '@core/variables/VariableFactory';
import { IPathService } from '@core/services/path/IPathService';
import { IInterpreterServiceClient, InterpreterServiceClientFactory } from '@core/services/interpreter/InterpreterServiceClient';
import logger from '@core/utils/logger';
import { ICircularityService } from '@core/services/circularity/ICircularityService';
import { IURLContentResolver } from '@core/services/networking/IURLContentResolver';
import { IStateTrackingService } from '@core/services/state/IStateTrackingService';
import { StateService } from '@core/services/state/StateService';

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

  async handle(
    context: DirectiveProcessingContext
  ): Promise<DirectiveResult> {
    const { directiveNode: baseNode, stateService: currentStateService, nodeLocation, contextPath } = context;
    const node = baseNode as ImportDirectiveNode;
    const location = nodeLocation ?? node.source;
    const currentFilePath = contextPath?.filesystem?.currentPath;

    if (this.debugEnabled) {
      // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] ENTER. Node: ${JSON.stringify(node)}, Context Path: ${currentFilePath ?? 'N/A'}\n`);
    }

    let resolvedIdentifier: string | undefined;
    let resolvedPath: StructuredPath | undefined;
    let errorObj: DirectiveError | undefined;

    const stateChangesAccumulator: Record<string, VariableDefinition> = {};

    try {
      // 1. Validate directive structure
      const validationResult = this.validationService.validateNode(node);
      if (!validationResult.isValid) {
        throw new DirectiveError(
          `Invalid import directive: ${validationResult.message}`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED
        );
      }

      // 2. Resolve the path/identifier
      const pathOrIdentifier = node.pathOrIdentifier;
      const resolutionResult = await this.resolutionService.resolvePath(pathOrIdentifier, currentStateService, contextPath, location);

      if (!resolutionResult.success || !resolutionResult.result) {
        throw new DirectiveError(
          `Failed to resolve import path/identifier: ${pathOrIdentifier}. ${resolutionResult.error?.message ?? 'Unknown resolution error'}`,
          this.kind,
          DirectiveErrorCode.RESOLUTION_FAILED,
          { cause: resolutionResult.error }
        );
      }
      resolvedPath = resolutionResult.result;
      resolvedIdentifier = resolvedPath.raw || resolvedPath.interpolatedValue || pathOrIdentifier; // Use raw or interpolated, fallback to original input

      if (!resolvedIdentifier) {
        throw new DirectiveError(
          `Resolved import path/identifier is empty for input: ${pathOrIdentifier}`,
          this.kind,
          DirectiveErrorCode.RESOLUTION_FAILED
        );
      }

      // 3. Circularity Check
      const normalizedIdentifier = resolvedIdentifier.replace(/\\/g, '/'); // Normalize for consistency
      this.circularityService.startImport(normalizedIdentifier, currentFilePath ?? 'unknown');

      // 4. Get Content (File or URL)
      let content: string | undefined;
      let sourceStateId: string | undefined; // State ID for the context of the imported content
      let sourceContextPath: StructuredPath | undefined; // Context path for the imported file

      if (resolvedPath.contentType === 'url' && this.urlContentResolver) {
        // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Importing from URL: ${resolvedIdentifier}\n`);
        content = await this.urlContentResolver.resolve(resolvedIdentifier);
        sourceStateId = `url:${resolvedIdentifier}`; // Create a unique state ID for URL content
        sourceContextPath = resolvedPath; // Use the resolved URL path as context
      } else if (resolvedPath.contentType === 'filesystem') {
        // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Importing from file: ${resolvedIdentifier}\n`);
        content = await this.fileSystemService.readFile(resolvedIdentifier);
        sourceStateId = `file:${resolvedIdentifier}`; // Create a unique state ID for file content
        sourceContextPath = this.pathService.createStructuredPath(resolvedIdentifier, 'filesystem'); // Create context path for the file
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

      // 5. Parse the imported content
      // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Parsing content from: ${resolvedIdentifier}\n`);
      const parseResult = await this.parserService.parse(content, { filePath: resolvedIdentifier });
      if (!parseResult.success || !parseResult.program) {
        throw new DirectiveError(
          `Failed to parse imported content from ${resolvedIdentifier}: ${parseResult.error?.message ?? 'Unknown parsing error'}`,
          this.kind,
          DirectiveErrorCode.PARSING_FAILED,
          { cause: parseResult.error }
        );
      }

      // 6. Interpret the parsed content to get its state
      // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Interpreting content from: ${resolvedIdentifier} using state ID ${sourceStateId}\n`);
      const interpreterServiceClient = this.ensureInterpreterServiceClient();
      // Use a dedicated state for interpretation, potentially seeded if needed later
      const interpretationResult = await interpreterServiceClient.interpretNode(
          parseResult.program,
          sourceStateId, // Use the unique ID for the source content's state
          {
             currentPath: sourceContextPath, // Provide context path of the imported file/URL
             rootPath: contextPath?.rootPath // Propagate root path if available
          }
      );

      if (!interpretationResult.success || !interpretationResult.stateChanges) {
         // process.stdout.write(`WARN: [ImportDirectiveHandler.handle] Interpretation of ${resolvedIdentifier} resulted in no state changes or failed. Error: ${interpretationResult.error?.message ?? 'None'}\n`);
         // Decide if this is an error or just an empty import
         // For now, we allow imports that result in no state changes.
         // If interpretation failed fundamentally, throw error:
         if (!interpretationResult.success && interpretationResult.error) {
           // Ensure the cause is an Error object or undefined
           const causeError = interpretationResult.error instanceof Error 
               ? interpretationResult.error 
               : (interpretationResult.error ? new Error(String(interpretationResult.error)) : undefined);
               
           throw new DirectiveError(
             `Failed to interpret imported content from ${resolvedIdentifier}`,
             this.kind,
             DirectiveErrorCode.EXECUTION_FAILED,
             { cause: causeError } // Pass the guaranteed Error or undefined
           );
         }
         // If successful but no state changes, proceed but log it.
         logger.debug(`Interpretation of ${resolvedIdentifier} completed successfully but yielded no state changes.`);
      }

      const sourceStateChanges = interpretationResult.stateChanges; // State changes FROM the imported content

      // 7. Process Imports (All or Structured)
      if (node.imports === '*') {
        // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Importing all variables from source state associated with ${resolvedIdentifier}\n`);
        if (sourceStateChanges) {
          this.importAllVariables(sourceStateChanges, stateChangesAccumulator, location, resolvedIdentifier, currentFilePath);
        } else {
           // process.stdout.write(`WARN: [ImportDirectiveHandler.handle] Skipping import * because source interpretation yielded no state changes for ${resolvedIdentifier}.\n`);
        }
      } else if (Array.isArray(node.imports)) {
        // process.stdout.write(`DEBUG: [ImportDirectiveHandler.handle] Processing structured imports from source state associated with ${resolvedIdentifier}\n`);
        if (sourceStateChanges) {
          await this.processStructuredImports(node.imports, sourceStateChanges, stateChangesAccumulator, location, resolvedIdentifier, currentFilePath);
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
        success: true,
        stateChanges: Object.keys(stateChangesAccumulator).length > 0 ? { variables: stateChangesAccumulator } : undefined,
        replacementNodes: [] // Import directives generally don't replace themselves with nodes
      };

    } catch (error) {
      let errorMessage = 'Unknown error during import execution';
      if (error instanceof DirectiveError) {
        errorObj = error; // Propagate directive errors directly
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
        errorObj = new DirectiveError(
          `Import directive error: ${errorMessage}`,
          this.kind,
          DirectiveErrorCode.EXECUTION_FAILED,
          { cause: error instanceof Error ? error : undefined }
        );
      } else {
        errorMessage = String(error);
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
            definedAt: importLocation ? {
              line: importLocation.start.line,
              column: importLocation.start.column,
              filePath: currentFilePath ?? 'unknown' // File where the import directive is
            } : undefined,
            context: {
              originalMetadata: originalVarDef.metadata,
              sourcePath: sourcePath // File/URL where the variable originally came from
            },
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };

          // Create the VariableDefinition for the target state
          const newVarDef: VariableDefinition = {
            type: originalVarDef.type,
            value: originalVarDef.value, // Value is assumed serializable already
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
    importLocation: SyntaxSourceLocation,
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
            definedAt: importLocation ? {
              line: importLocation.start.line,
              column: importLocation.start.column,
              filePath: currentFilePath ?? 'unknown' // File where the import directive is
            } : undefined,
            context: {
              originalMetadata: originalVarDef.metadata,
              sourcePath: sourcePath // File/URL where the variable originally came from
            },
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };

          // Create the VariableDefinition for the target state
          const newVarDef: VariableDefinition = {
            type: originalVarDef.type,
            value: originalVarDef.value, // Value is assumed serializable already
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