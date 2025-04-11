import { DirectiveNode, DirectiveData } from '@core/syntax/types/index.js';
// Define interfaces matching the meld-ast structure for data directives
interface DataDirective extends DirectiveData {
  kind: 'data';
  identifier: string;
  source: 'literal' | 'reference' | 'run' | 'embed';
  value: any;
  // Add properties from AST if DataDirectiveData is not used
  run?: any; 
  embed?: any;
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
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { MeldResolutionError, FieldAccessError, PathValidationError, MeldError } from '@core/errors';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import type { StateServiceLike } from '@core/shared-service-types.js';
import type { InterpolatableValue, VariableReferenceNode } from '@core/syntax/types/nodes.js'; // Assume InterpolatableValue here

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
    @inject('IPathService') private pathService: IPathService
  ) {}

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult | StateServiceLike> {
    logger.debug('Processing data directive', {
      location: node.location,
      directive: node.directive
    });

    await this.validationService.validate(node);

    // Use a type assertion, ensure DataDirective interface includes run/embed
    const directive = node.directive as DataDirective;
    const { identifier, value, source } = directive;
    logger.info('[DataDirectiveHandler] Processing:', { identifier, value: JSON.stringify(value), source });

    const resolutionContext = ResolutionContextFactory.forDataDirective(
      context.state, 
      context.currentFilePath
    );

    try {
      let resolvedValue: unknown;

      if (source === 'literal') {
        resolvedValue = await this.resolveInterpolatableValuesInData(value, resolutionContext);
      } else if (source === 'run' && directive.run) {
        try {
          const commandNodes = directive.run.command as InterpolatableValue;
          if (!commandNodes) throw new Error('Missing command node for @run source');
          const resolvedCommandString = await this.resolutionService.resolveNodes(commandNodes, resolutionContext);
          
          const fsService = this.fileSystemService;
          if (!fsService) {
            throw new DirectiveError('File system service is unavailable for @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context });
          }
          
          const { stdout } = await fsService.executeCommand(resolvedCommandString, { cwd: fsService.getCwd() });
          
          try {
            resolvedValue = JSON.parse(stdout);
          } catch (parseError) {
            throw new DirectiveError(
              `Failed to parse command output as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
              this.kind, 
              DirectiveErrorCode.EXECUTION_FAILED, 
              { // Details object
                 node, 
                 context, 
                 cause: parseError instanceof Error ? parseError : undefined 
              }
            );
          }
          logger.debug('Executed command and parsed JSON for @data directive', { resolvedCommand: resolvedCommandString, output: resolvedValue });
        } catch (error) {
            if (error instanceof DirectiveError) throw error; 
            const code = (error instanceof MeldResolutionError || error instanceof FieldAccessError) ? DirectiveErrorCode.RESOLUTION_FAILED : DirectiveErrorCode.EXECUTION_FAILED;
            const message = (code === DirectiveErrorCode.RESOLUTION_FAILED) ? 'Failed to resolve command for @data directive' : `Failed to execute command for @data directive: ${error instanceof Error ? error.message : 'Unknown'}`;
            throw new DirectiveError(message, this.kind, code, { node, context, cause: error instanceof Error ? error : undefined });
        }
      } else if (source === 'embed' && directive.embed) {
         try {
          const embedPathObject = directive.embed.path;
          if (!embedPathObject) {
             throw new DirectiveError('Missing path for @embed source in @data directive', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node, context });
          }
          
          const valueToResolve = embedPathObject.interpolatedValue ?? embedPathObject.raw;
          const resolvedEmbedPathString = await this.resolutionService.resolveInContext(valueToResolve, resolutionContext);
          const validatedMeldPath = await this.resolutionService.resolvePath(resolvedEmbedPathString, resolutionContext);
          
          const fsService = this.fileSystemService;
          if (!fsService) {
            throw new DirectiveError('File system service is unavailable for @embed execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context });
          }
          
          let fileContent = await fsService.readFile(validatedMeldPath.validatedPath);
          
          if (directive.embed.section) {
             fileContent = await this.resolutionService.extractSection(fileContent, directive.embed.section);
          }

          try {
            resolvedValue = JSON.parse(fileContent);
          } catch (parseError) {
             throw new DirectiveError(
              `Failed to parse embedded file content as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
              this.kind, 
              DirectiveErrorCode.EXECUTION_FAILED, 
              { // Details object
                node, 
                context, 
                cause: parseError instanceof Error ? parseError : undefined
              }
            );
          }
          logger.debug('Embedded file and parsed JSON for @data directive', { resolvedPath: resolvedEmbedPathString, section: directive.embed.section, output: resolvedValue });
        } catch (error) {
            if (error instanceof DirectiveError) throw error;
            const code = (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) ? DirectiveErrorCode.RESOLUTION_FAILED : DirectiveErrorCode.EXECUTION_FAILED;
            const message = code === DirectiveErrorCode.RESOLUTION_FAILED ? 'Failed to resolve @embed source for @data directive' : `Failed to read/process embed source for @data directive: ${error instanceof Error ? error.message : 'Unknown'}`;
            throw new DirectiveError(message, this.kind, code, { node, context, cause: error instanceof Error ? error : undefined });
        }
      } 
      // Remove old 'reference' and fallback 'else' blocks if source is now guaranteed to be literal, run, or embed by parser/validation
      else {
         throw new DirectiveError(
              `Unsupported source type '${source}' for @data directive`,
              this.kind, 
              DirectiveErrorCode.VALIDATION_FAILED, 
              { node, context }
          );
      }

      // Store the resolved value in a new state
      const newState = context.state.clone();
      logger.info('[DataDirectiveHandler] Setting data var:', { identifier, resolvedValue: JSON.stringify(resolvedValue) });
      newState.setDataVar(identifier, resolvedValue as JsonValue);
      return { state: newState, replacement: undefined }; 

    } catch (error) {
      // Final catch-all
      if (error instanceof DirectiveError) {
        throw error;
      } 
      // Wrap other errors
      throw new DirectiveError(
        `Error processing data directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'data',
        DirectiveErrorCode.EXECUTION_FAILED,
        { 
          node, 
          context,
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  /**
   * Recursively traverses an object/array, resolving any InterpolatableValue arrays found.
   */
  private async resolveInterpolatableValuesInData(
    data: unknown,
    context: ResolutionContext
  ): Promise<JsonValue> {
    if (isInterpolatableValueArray(data)) {
      return await this.resolutionService.resolveNodes(data, context);
    }
    if (Array.isArray(data)) {
      const resolvedArray: JsonValue[] = [];
      for (const item of data) {
          resolvedArray.push(await this.resolveInterpolatableValuesInData(item, context));
      }
      return resolvedArray;
    }
    if (typeof data === 'object' && data !== null) {
      const resolvedObject: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(data)) {
        resolvedObject[key] = await this.resolveInterpolatableValuesInData(value, context);
      }
      return resolvedObject;
    }
    return data as JsonValue;
  }

  /**
   * Validate resolved value against schema (Placeholder)
   */
  private async validateSchema(
    value: any,
    schema: string,
    node: DirectiveNode
  ): Promise<void> {
    logger.debug('Schema validation requested (Not Implemented)', { schema, location: node.location });
    // TODO: Implement schema validation logic
  }
} 