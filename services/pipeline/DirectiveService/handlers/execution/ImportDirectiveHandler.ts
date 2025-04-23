import { inject, injectable } from 'tsyringe';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import { DirectiveProcessingContext } from '@core/types';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { DirectiveNode } from '@core/syntax/types';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { MeldNode } from '@core/syntax/types';
import { NodeType, StructuredPath } from '@core/syntax/types/nodes';
import { SourceLocation } from '@core/types/common';
import { 
  VariableOrigin, 
  VariableType, 
  type VariableMetadata, 
  type VariableDefinition,
  type TextVariable,
  type DataVariable,
  type PathVariable,
  type CommandVariable,
  createTextVariable,
  createDataVariable,
  createPathVariable,
  createCommandVariable
} from '@core/types/variables';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import { directiveLogger as logger } from '@core/utils/logger';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver';
import { MeldPath, PathContentType } from '@core/types/paths';
import { MeldResolutionError, MeldFileNotFoundError, MeldError } from '@core/errors';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import { Service } from '@core/ServiceProvider';

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
    @inject('IURLContentResolver') private urlContentResolver?: IURLContentResolver
  ) {
    this.interpreterServiceClient = this.interpreterServiceClientFactory.createClient();
  }

  async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    const { directiveNode: node, state: currentStateService, resolutionContext } = context;
    const currentFilePath = currentStateService.getCurrentFilePath();
    const baseErrorDetails = { 
      node: node, 
      context: { currentFilePath: currentFilePath ?? undefined } 
    };

    let resolvedPath: MeldPath | undefined;
    let normalizedPath: string | undefined;

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      if (!node.directive || node.directive.kind !== 'import') {
         throw new DirectiveError('Invalid node type passed to ImportDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
      }

      const pathObject = node.directive.path as StructuredPath | undefined;
      const importsList = node.directive.imports as '*' | Array<{ name: string; alias?: string | null }> | undefined;

      if (!pathObject?.raw) {
         throw new DirectiveError('Import directive missing path or path is invalid', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
      }

      // 2. Resolve the path
      try {
        const resolvedPathString = await this.resolutionService.resolveInContext(pathObject, resolutionContext);
        if (!resolvedPathString) {
          throw new MeldResolutionError(`Path resolved to an empty string for input: ${pathObject.raw}`, { 
            code: 'E_RESOLVE_EMPTY_PATH', 
            details: { originalPath: pathObject.raw }
          });
        }
        resolvedPath = await this.resolutionService.resolvePath(resolvedPathString, resolutionContext);
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        throw new DirectiveError(
          `Failed to resolve import path/identifier: ${pathObject.raw}. ${cause.message}`,
          this.kind,
          DirectiveErrorCode.RESOLUTION_FAILED,
          { ...baseErrorDetails, cause }
        );
      }

      // 3. Circularity Check
      normalizedPath = resolvedPath.validatedPath.replace(/\\/g, '/');
      this.circularityService.beginImport(normalizedPath);

      try {
        // 4. Get Content
        let content: string;
        if (resolvedPath.contentType === PathContentType.URL && this.urlContentResolver) {
          const urlResponse = await this.urlContentResolver.fetchURL(resolvedPath.validatedPath, {});
          content = urlResponse.content;
        } else if (resolvedPath.contentType === PathContentType.FILESYSTEM) {
          const fileExists = await this.fileSystemService.exists(resolvedPath.validatedPath);
          if (!fileExists) {
            throw new DirectiveError(
              `Import file not found: ${resolvedPath.validatedPath}`,
              this.kind,
              DirectiveErrorCode.FILE_NOT_FOUND,
              baseErrorDetails
            );
          }
          content = await this.fileSystemService.readFile(resolvedPath.validatedPath);
        } else {
          throw new DirectiveError(
            `Unsupported import type for path: ${resolvedPath.validatedPath}`,
            this.kind,
            DirectiveErrorCode.EXECUTION_FAILED,
            baseErrorDetails
          );
        }

        // 5. Parse Content
        const astNodes = await this.parserService.parse(content) as MeldNode[];
        if (!Array.isArray(astNodes)) {
          throw new DirectiveError(
            `Parsing did not return a valid AST node array. Received: ${typeof astNodes}`,
            this.kind,
            DirectiveErrorCode.EXECUTION_FAILED,
            baseErrorDetails
          );
        }

        // 6. Interpret Content
        const childState = await currentStateService.createChildState();
        childState.setCurrentFilePath(resolvedPath.validatedPath);

        let interpretedState;
        try {
          interpretedState = await this.interpreterServiceClient.interpret(
            astNodes,
            {
              filePath: resolvedPath.validatedPath,
              mergeState: false,
            },
            childState,
            this.circularityService
          );
        } catch (error) {
          const cause = error instanceof Error ? error : new Error(String(error));
          throw new DirectiveError(
            `Failed to interpret imported content from ${resolvedPath.validatedPath}. ${cause.message}`,
            this.kind,
            DirectiveErrorCode.EXECUTION_FAILED,
            { ...baseErrorDetails, cause }
          );
        }

        // 7. Process Variables
        const changedVarNames = interpretedState.getLocalChanges();
        const sourceVariables: Record<string, VariableDefinition> = {};
        for (const name of changedVarNames) {
          const variable = interpretedState.getVariable(name);
          if (!variable) continue;

          // Create variable definition using canonical factory functions
          let varDef: VariableDefinition;
          const now = Date.now();
          const baseMetadata: VariableMetadata = {
            ...variable.metadata,
            origin: VariableOrigin.IMPORT,
            importedFrom: resolvedPath.validatedPath,
            importedAt: now,
            createdAt: now,
            modifiedAt: now
          };

          // Extract the actual value from the variable
          const value = variable.value?.value ?? variable.value;

          switch (variable.type) {
            case VariableType.TEXT:
              varDef = createTextVariable(name, value, baseMetadata);
              break;
            case VariableType.DATA:
              varDef = createDataVariable(name, value, baseMetadata);
              break;
            case VariableType.PATH:
              varDef = createPathVariable(name, value, baseMetadata);
              break;
            case VariableType.COMMAND:
              varDef = createCommandVariable(name, value, baseMetadata);
              break;
            default:
              logger.warn(`Skipping import of variable with unknown type: ${variable.type}`, { name });
              continue;
          }

          sourceVariables[name] = varDef;
        }

        // 8. Process Imports
        const importLocation: SourceLocation | undefined = node.location ? {
          filePath: currentFilePath ?? 'unknown',
          line: node.location.start.line,
          column: node.location.start.column
        } : undefined;

        let resultVariables: Record<string, VariableDefinition> = {};

        if (importsList === '*' || (Array.isArray(importsList) && importsList.length === 1 && importsList[0].name === '*' && !importsList[0].alias)) {
          resultVariables = this.importAllVariables(sourceVariables, importLocation, resolvedPath.validatedPath, currentFilePath);
        } else if (Array.isArray(importsList)) {
          resultVariables = await this.processStructuredImports(importsList, sourceVariables, importLocation, resolvedPath.validatedPath, currentFilePath);
        }

        // 9. Return Result
        return {
          stateChanges: {
            variables: resultVariables
          },
          replacement: [] // Import directives don't produce output
        };

      } finally {
        // Always end import tracking if we started it
        if (normalizedPath) {
          this.circularityService.endImport(normalizedPath);
        }
      }

    } catch (error) {
      let errorToThrow: DirectiveError;

      if (error instanceof DirectiveError) {
        errorToThrow = error;
      } else if (error instanceof Error) {
        let code = DirectiveErrorCode.EXECUTION_FAILED;
        if (error instanceof MeldResolutionError) {
          code = DirectiveErrorCode.RESOLUTION_FAILED;
        } else if (error instanceof MeldFileNotFoundError) {
          code = DirectiveErrorCode.FILE_NOT_FOUND;
        } else if (error instanceof MeldError && error.code === 'CIRCULAR_IMPORT') {
          code = DirectiveErrorCode.CIRCULAR_REFERENCE;
        }

        errorToThrow = new DirectiveError(
          `Import directive error: ${error.message}`,
          this.kind,
          code,
          { ...baseErrorDetails, cause: error }
        );
      } else {
        errorToThrow = new DirectiveError(
          `Import directive error: ${String(error)}`,
          this.kind,
          DirectiveErrorCode.EXECUTION_FAILED,
          { ...baseErrorDetails, cause: new Error(String(error)) }
        );
      }

      // Ensure we clean up circularity tracking even on error
      if (normalizedPath) {
        this.circularityService.endImport(normalizedPath);
      }

      throw errorToThrow;
    }
  }

  private importAllVariables(
    sourceVariables: Record<string, VariableDefinition>,
    importLocation: SourceLocation | undefined,
    sourcePath: string | undefined,
    currentFilePath: string | undefined
  ): Record<string, VariableDefinition> {
    const result: Record<string, VariableDefinition> = {};
    const now = Date.now();
    
    for (const [name, variable] of Object.entries(sourceVariables)) {
      // Create new variable definition using canonical factory functions
      let varDef: VariableDefinition;
      const baseMetadata: VariableMetadata = {
        origin: VariableOrigin.IMPORT,
        importLocation,
        importedFrom: sourcePath,
        importedInto: currentFilePath,
        importedAt: now,
        createdAt: now,
        modifiedAt: now
      };

      // Extract the actual value from the variable
      const value = variable.value?.value ?? variable.value;

      switch (variable.type) {
        case VariableType.TEXT:
          varDef = createTextVariable(name, value, baseMetadata);
          break;
        case VariableType.DATA:
          varDef = createDataVariable(name, value, baseMetadata);
          break;
        case VariableType.PATH:
          varDef = createPathVariable(name, value, baseMetadata);
          break;
        case VariableType.COMMAND:
          varDef = createCommandVariable(name, value, baseMetadata);
          break;
        default:
          logger.warn(`Skipping import of variable with unknown type: ${variable.type}`, { name });
          continue;
      }

      result[name] = varDef;
    }

    return result;
  }

  private async processStructuredImports(
    imports: Array<{ name: string; alias?: string | null }>,
    sourceVariables: Record<string, VariableDefinition>,
    importLocation: SourceLocation | undefined,
    sourcePath: string | undefined,
    currentFilePath: string | undefined
  ): Promise<Record<string, VariableDefinition>> {
    const result: Record<string, VariableDefinition> = {};
    const now = Date.now();

    for (const importSpec of imports) {
      const { name, alias } = importSpec;
      const targetName = alias || name;

      const variable = sourceVariables[name];
      if (!variable) {
        throw new DirectiveError(
          `Variable '${name}' not found in imported content`,
          this.kind,
          DirectiveErrorCode.RESOLUTION_FAILED
        );
      }

      // Create new variable definition using canonical factory functions
      let varDef: VariableDefinition;
      const baseMetadata: VariableMetadata = {
        origin: VariableOrigin.IMPORT,
        importLocation,
        importedFrom: sourcePath,
        importedInto: currentFilePath,
        importedAt: now,
        createdAt: now,
        modifiedAt: now,
        originalName: name !== targetName ? name : undefined
      };

      // Extract the actual value from the variable
      const value = variable.value?.value ?? variable.value;

      switch (variable.type) {
        case VariableType.TEXT:
          varDef = createTextVariable(targetName, value, baseMetadata);
          break;
        case VariableType.DATA:
          varDef = createDataVariable(targetName, value, baseMetadata);
          break;
        case VariableType.PATH:
          varDef = createPathVariable(targetName, value, baseMetadata);
          break;
        case VariableType.COMMAND:
          varDef = createCommandVariable(targetName, value, baseMetadata);
          break;
        default:
          throw new DirectiveError(
            `Cannot import variable '${name}' with unknown type: ${variable.type}`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED
          );
      }

      result[targetName] = varDef;
    }

    return result;
  }
}