import { DirectiveNode, DirectiveData } from '@core/syntax/types.js';
// Define interfaces matching the meld-ast structure for data directives
interface DataDirective extends DirectiveData {
  kind: 'data';
  identifier: string;
  source: 'literal' | 'reference' | 'run' | 'embed';
  value: any;
}

import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { JsonValue } from '@core/types';
import { isInterpolatableValueArray } from '@services/resolution/ResolutionService/resolvers/isInterpolatableValueArray.js';
import type { IFileSystemService } from '@services/fileSystem/IFileSystemService.js';
import type { IFieldAccessService } from '@services/fieldAccess/IFieldAccessService.js';
import type { IPathService } from '@services/path/IPathService.js';
import type { IResolutionError } from '@services/resolution/ResolutionService/IResolutionError.js';
import type { IFieldAccessError } from '@services/fieldAccess/IFieldAccessError.js';
import type { IPathValidationError } from '@services/path/IPathValidationError.js';

/**
 * Handler for @data directives
 * Stores data values in state after resolving variables and processing embedded content
 */
@injectable()
@Service({
  description: 'Handler for @data directives'
})
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IStateService') private stateService: IStateService,
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService,
    @inject('IFieldAccessService') private fieldAccessService: IFieldAccessService,
    @inject('IPathService') private pathService: IPathService
  ) {}

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing data directive', {
      location: node.location,
      directive: node.directive
    });

    await this.validationService.validate(node);

    const { identifier, value, source } = node.directive as DataDirective;
    logger.info('[DataDirectiveHandler] Processing:', { identifier, value: JSON.stringify(value), source });

    // Use ResolutionContextFactory to create the context
    const resolutionContext = ResolutionContextFactory.forDataDirective(
      context.state, 
      context.currentFilePath
    );

    try {
      let resolvedValue: unknown;

      // Values already come parsed from the AST - we just need to resolve any variables inside them
      if (source === 'literal') {
        // Value is already parsed by the AST.
        // We need to recursively traverse it and resolve any nested InterpolatableValue arrays.
        resolvedValue = await this.resolveInterpolatableValuesInData(value, resolutionContext);
      } else if (source === 'reference') {
        // Handle reference source (if needed)
        // This handles cases where value is a reference to another variable
        // TODO: Does this case still exist with the new AST? Re-evaluate.
        // Assuming for now 'value' here might be a string like "{{someDataVar}}"
        resolvedValue = await this.resolutionService.resolveInContext(value, resolutionContext);
        // If the result of resolving the reference is a string that needs JSON parsing:
        if (typeof resolvedValue === 'string') {
           try {
              resolvedValue = JSON.parse(resolvedValue);
           } catch (e) {
              // If parsing fails, maybe it was just a string variable? Keep as string.
              logger.debug('Resolved reference was not JSON, keeping as string', { resolvedValue });
           }
        }
      } else if (source === 'run' && node.directive.run) {
        try {
          const commandNodes = node.directive.run.command;
          if (!commandNodes) throw new Error('Missing command node for @run source');
          const resolvedCommandString = await this.resolutionService.resolveNodes(commandNodes, resolutionContext);
          
          // Ensure FileSystemService is available (might need injection or method)
          const fsService = (this as any).fileSystemService as IFileSystemService | undefined; 
          if (!fsService) {
            throw new DirectiveError('File system service is unavailable for @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context });
          }
          
          const { stdout } = await fsService.executeCommand(resolvedCommandString, { cwd: fsService.getCwd() });
          
          try {
            resolvedValue = JSON.parse(stdout);
          } catch (parseError) {
            throw new DirectiveError(
              `Failed to parse command output as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
              this.kind, DirectiveErrorCode.EXECUTION_FAILED, 
              { node, context, cause: parseError, details: { stdout } }
            );
          }
          
          logger.debug('Executed command and parsed JSON for @data directive', { resolvedCommand: resolvedCommandString, output: resolvedValue });

        } catch (error) {
            if (error instanceof DirectiveError) throw error; // Re-throw directive errors
            if (error instanceof ResolutionError || error instanceof FieldAccessError) { 
                throw new DirectiveError('Failed to resolve command for @data directive', this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node, context, cause: error });
            } else if (error instanceof Error) { 
                throw new DirectiveError(`Failed to execute command for @data directive: ${error.message}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context, cause: error });
            }
            throw error; 
        }
      } else if (source === 'embed' && node.directive.embed) {
         try {
          const embedPathObject = node.directive.embed.path;
          if (!embedPathObject) {
             throw new DirectiveError('Missing path for @embed source in @data directive', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node, context });
          }
          
          const resolvedEmbedPathString = await this.resolutionService.resolveInContext(embedPathObject, resolutionContext);
          const validatedMeldPath = await this.resolutionService.resolvePath(resolvedEmbedPathString, resolutionContext);
          
          const fsService = (this as any).fileSystemService as IFileSystemService | undefined; 
          if (!fsService) {
            throw new DirectiveError('File system service is unavailable for @embed execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context });
          }
          
          let fileContent = await fsService.readFile(validatedMeldPath.validatedPath);
          
          if (node.directive.embed.section) {
             fileContent = await this.resolutionService.extractSection(fileContent, node.directive.embed.section);
          }

          try {
            resolvedValue = JSON.parse(fileContent);
          } catch (parseError) {
             throw new DirectiveError(
              `Failed to parse embedded file content as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
              this.kind, DirectiveErrorCode.EXECUTION_FAILED, 
              { node, context, cause: parseError, details: { filePath: validatedMeldPath.validatedPath } }
            );
          }
          
          logger.debug('Embedded file and parsed JSON for @data directive', { resolvedPath: resolvedEmbedPathString, section: node.directive.embed.section, output: resolvedValue });
          
        } catch (error) {
            if (error instanceof DirectiveError) throw error;
            if (error instanceof ResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) {
                throw new DirectiveError('Failed to resolve @embed source for @data directive', this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node, context, cause: error });
            } else if (error instanceof Error) { 
                throw new DirectiveError(`Failed to read/process embed source for @data directive: ${error.message}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED,{ node, context, cause: error });
            }
            throw error;
        }
      } else {
         // This block should now only handle unknown/invalid source values
         logger.warn(`DataDirectiveHandler encountered unexpected source: ${source}`);
         // Fallback logic (attempt to resolve/parse as before)
         if (typeof value === 'string') {
            const resolvedJsonString = await this.resolutionService.resolveInContext(value, resolutionContext);
            try {
              resolvedValue = JSON.parse(resolvedJsonString);
            } catch (error) {
               // Rethrow previous validation error if needed
                throw new DirectiveError(
                    `Invalid JSON in data directive fallback: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    'data', DirectiveErrorCode.VALIDATION_FAILED, 
                    { node, context, severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED], cause: error }
                );
            }
         } else {
            // Value is object/array - use the NEW resolver helper
            resolvedValue = await this.resolveInterpolatableValuesInData(value, resolutionContext);
         }
      }

      // Store the resolved value in a new state
      const newState = context.state.clone();
      logger.info('[DataDirectiveHandler] Setting data var:', { identifier, resolvedValue: JSON.stringify(resolvedValue) });
      newState.setDataVar(identifier, resolvedValue);
      return newState;
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Error processing data directive: ${error.message}`,
          'data',
          DirectiveErrorCode.EXECUTION_FAILED,
          { 
            node, 
            context,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED]
          }
        );
      }
      throw error;
    }
  }

  /**
   * Recursively traverses an object/array, resolving any InterpolatableValue arrays found.
   *
   * @param data The data structure to traverse (object, array, primitive, or InterpolatableValue).
   * @param context The resolution context.
   * @returns The data structure with all InterpolatableValues resolved to strings.
   */
  private async resolveInterpolatableValuesInData(
    data: unknown,
    context: ResolutionContext
  ): Promise<JsonValue> {
    if (isInterpolatableValueArray(data)) {
      // If it's an InterpolatableValue array, resolve it to a string
      return await this.resolutionService.resolveNodes(data, context);
    }

    if (Array.isArray(data)) {
      // If it's an array, recursively resolve each item
      const resolvedArray: JsonValue[] = [];
      for (const item of data) {
          resolvedArray.push(await this.resolveInterpolatableValuesInData(item, context));
      }
      return resolvedArray;
    }

    if (typeof data === 'object' && data !== null) {
      // If it's an object, recursively resolve each value
      const resolvedObject: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(data)) {
        resolvedObject[key] = await this.resolveInterpolatableValuesInData(value, context);
      }
      return resolvedObject;
    }

    // For primitives (string, number, boolean, null), return as is
    // Note: Plain strings that didn't parse into InterpolatableValue are returned directly.
    // JSON spec allows strings, numbers, booleans, null as top-level values.
    return data as JsonValue;
  }

  /**
   * Validate resolved value against schema
   */
  private async validateSchema(
    value: any,
    schema: string,
    node: DirectiveNode
  ): Promise<void> {
    try {
      // TODO: Implement schema validation once schema system is defined
      // For now, just log that we would validate
      logger.debug('Schema validation requested', {
        schema,
        location: node.location
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Schema validation failed: ${error.message}`,
          'data',
          DirectiveErrorCode.VALIDATION_FAILED,
          { 
            node,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
          }
        );
      }
      throw error;
    }
  }
} 