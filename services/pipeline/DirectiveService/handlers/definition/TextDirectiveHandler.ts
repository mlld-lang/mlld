import type { 
    DirectiveNode, 
    TextNode, 
    VariableReferenceNode,
    MeldNode 
} from '@core/ast/types/index';
import type { InterpolatableValue, StructuredPath } from '@core/syntax/types/nodes'; 
import type { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { directiveLogger as logger } from '@core/utils/logger';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity, FieldAccessError, PathValidationError, MeldResolutionError } from '@core/errors';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { VariableMetadata, VariableDefinition } from '@core/types/variables';
import { VariableType, VariableOrigin, createTextVariable } from '@core/types/variables';
import type { SourceLocation } from '@core/types/common';
import { isInterpolatableValueArray } from '@core/syntax/types/guards'; 
import { ICommandDefinition, isBasicCommand } from '@core/types/exec';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler'; 
import { DirectiveKind } from '@core/syntax/types/directives'; 
import { isCommandVariable } from '@core/types/guards';

interface EmbedRHSStructure {
    subtype: 'addPath' | 'addVariable' | 'addTemplate';
    path?: StructuredPath; 
    content?: InterpolatableValue;
    section?: string;
}

interface RunRHSStructure {
    subtype: 'runCommand' | 'runCode' | 'runCodeParams' | 'runExec';
    command?: InterpolatableValue | { name: string, args: any[], raw: string };
    language?: string;
    isMultiLine?: boolean;
    parameters?: Array<VariableReferenceNode | string>;
}

@injectable()
@Service({
  description: 'Handler for @text directives'
})
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text'; 

  constructor(
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService 
  ) {
  }

  async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> { 
    const state = context.state; 
    const node = context.directiveNode as DirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    const errorDetailsContext = { 
      node: node, 
      context: context 
    };

    logger.debug('Processing text directive', {
      location: node.location,
      context: {
        currentFilePath: currentFilePath ?? 'unknown',
        stateExists: !!state,
      },
      raw: node.raw,
      values: node.values
    });
    
    let identifier: string | undefined; 
    let resolvedValue: string | undefined; 

    try {
      const directiveSourceLocation: SourceLocation | undefined = node.location?.start ? {
        filePath: currentFilePath ?? 'unknown',
        line: node.location.start.line,
        column: node.location.start.column
      } : undefined;

      identifier = node.raw.identifier;
      const textValues = node.values;
      
      if (!textValues) {
        throw new DirectiveError(
          'Text directive values are missing or invalid',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          errorDetailsContext
        );
      }
      
      if (!identifier) {
        const baseErrorDetails = { node: node, context: context }; 
        throw new DirectiveError(
          'Text directive identifier is missing or invalid',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          baseErrorDetails
        );
      }
      
      logger.debug('TextDirectiveHandler: node structure', {
        values: node.values,
        raw: node.raw,
        meta: node.meta,
        source: node.source
      });

      const source = node.source || 'literal';
      const values = textValues.values ? textValues.values[0] : undefined;
      const value = node.raw.value || node.raw.values;
      const embed = node.values.embed ? node.values.embed[0] : undefined;
      const run = node.values.run ? node.values.run[0] : undefined;
      
      if (source === 'literal') {
        logger.debug('TextDirectiveHandler: value/values structure', {
          value,
          values,
          valueType: typeof value,
          valuesType: typeof values,
          isArray: Array.isArray(values),
          valueToString: String(value),
          valuesToString: String(values)
        });

        if (values && isInterpolatableValueArray(values)) {
          resolvedValue = await this.resolutionService.resolveNodes(values, resolutionContext);
        } else if (value) {
          if (typeof value === 'string') {
            const textNode: TextNode = {
              type: 'Text',
              nodeId: 'placeholder-id',
              content: value,
              location: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: value.length + 1 }
              }
            };
            resolvedValue = await this.resolutionService.resolveNodes([textNode], resolutionContext);
          } else if (isInterpolatableValueArray(value)) {
            resolvedValue = await this.resolutionService.resolveNodes(value, resolutionContext);
          } else {
            resolvedValue = await this.resolutionService.resolveInContext(value, resolutionContext);
          }
        } else {
          throw new DirectiveError(
            'Invalid value type for @text source \'literal\'. Expected string or InterpolatableValue array.',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            errorDetailsContext
          );
        }
      } else if (source === 'run' && run) {
        const runDetails = run as RunRHSStructure;
        try {
          const commandInput = runDetails.command;
          const runSubtype = runDetails.subtype;
          if (!commandInput) throw new DirectiveError('Missing command input for @run source', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
          
          let resolvedCommandString: string;

          if (runSubtype === 'runExec') {
             if (typeof commandInput !== 'object' || !('name' in commandInput)) {
                 throw new DirectiveError('Invalid command input structure for runExec subtype', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
             }
             const cmdVar = await state.getVariable(commandInput.name, VariableType.COMMAND);
             if (cmdVar && isCommandVariable(cmdVar) && cmdVar.value && isBasicCommand(cmdVar.value)) {
                resolvedCommandString = cmdVar.value.commandTemplate;
             } else {
                const errorMsg = cmdVar ? `Command '${commandInput.name}' is not a basic command suitable for @text/@run` : `Command definition '${commandInput.name}' not found`;
                throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, errorDetailsContext);
             }
          } else if (runSubtype === 'runCommand' || runSubtype === 'runCode' || runSubtype === 'runCodeParams') {
             if (!isInterpolatableValueArray(commandInput)) {
                throw new DirectiveError(`Expected InterpolatableValue for command input with subtype '${runSubtype}'`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
             }
             resolvedCommandString = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
          } else {
             throw new DirectiveError(`Unsupported run subtype '${runSubtype}' encountered in @text handler`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
          }
          if (!this.fileSystemService) {
            throw new DirectiveError('File system service is unavailable for @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, errorDetailsContext);
          }
          const { stdout } = await this.fileSystemService.executeCommand(
              resolvedCommandString,
              { cwd: this.fileSystemService.getCwd() } 
          );
          resolvedValue = stdout.replace(/\n$/, ''); 

        } catch (error) {
          if (error instanceof DirectiveError) throw error;
          if (error instanceof MeldResolutionError || error instanceof FieldAccessError) {
            throw new DirectiveError('Failed to resolve command for @text directive', this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...errorDetailsContext, cause: error instanceof Error ? error : undefined });
          } else if (error instanceof Error) {
            throw new DirectiveError(`Failed to execute command for @text directive: ${error.message}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED, { ...errorDetailsContext, cause: error });
          }
          throw new DirectiveError('Unknown error during @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { ...errorDetailsContext, cause: error instanceof Error ? error : undefined });
        }
      } else if (source === 'add' && embed) {
        const embedDetails = embed as EmbedRHSStructure;
        try {
          const embedSubtype = embedDetails.subtype;
          let fileContent: string;

          if (embedSubtype === 'addPath') {
              const embedPathObject = embedDetails.path;
              if (!embedPathObject) {
                 throw new DirectiveError('Missing path for @add source (subtype: addPath)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
              }
              const valueToResolve = embedPathObject.interpolatedValue ?? embedPathObject.raw;
              const resolvedEmbedPathString = await this.resolutionService.resolveInContext(valueToResolve, resolutionContext);
              const validatedMeldPath = await this.resolutionService.resolvePath(resolvedEmbedPathString, resolutionContext);
              
              if (validatedMeldPath.contentType !== 'filesystem') {
                  throw new DirectiveError(`Cannot embed non-filesystem path: ${resolvedEmbedPathString}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
              }
              if (!this.fileSystemService) { 
                throw new DirectiveError('File system service is unavailable for @add execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, errorDetailsContext);
              }
              fileContent = await this.fileSystemService.readFile(validatedMeldPath.validatedPath);

          } else if (embedSubtype === 'addVariable') {
              const embedPathObject = embedDetails.path; 
              if (!embedPathObject) {
                 throw new DirectiveError('Missing variable reference for @add source (subtype: addVariable)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
              }
              fileContent = await this.resolutionService.resolveInContext(embedPathObject.raw, resolutionContext);

          } else if (embedSubtype === 'addTemplate') {
              const templateContent = embedDetails.content;
              if (!templateContent || !isInterpolatableValueArray(templateContent)) { 
                  throw new DirectiveError('Missing or invalid content for @add source (subtype: addTemplate)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
              }
              fileContent = await this.resolutionService.resolveNodes(templateContent, resolutionContext);
          } else {
             throw new DirectiveError(`Unsupported add subtype: ${embedSubtype}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
          }
          
          if (embedDetails.section) {
             resolvedValue = await this.resolutionService.extractSection(fileContent, embedDetails.section);
          } else {
             resolvedValue = fileContent;
          }
          
        } catch (error) {
          if (error instanceof DirectiveError) throw error;
          if (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) {
            throw new DirectiveError('Failed to resolve @add source for @text directive', this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...errorDetailsContext, cause: error instanceof Error ? error : undefined });
          } else if (error instanceof Error) {
            throw new DirectiveError(`Failed to read/process embed source for @text directive: ${error.message}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED, { ...errorDetailsContext, cause: error });
          }
          throw new DirectiveError('Unknown error during @add execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { ...errorDetailsContext, cause: error instanceof Error ? error : undefined });
        }
      } else {
        throw new DirectiveError(
              `Unsupported source type '${source}' for @text directive`,
              this.kind, 
              DirectiveErrorCode.VALIDATION_FAILED, 
              errorDetailsContext
          );
      }

      if (resolvedValue === undefined) {
        throw new DirectiveError(
          `Failed to determine the value for text variable '${identifier}'`,
          this.kind,
          DirectiveErrorCode.RESOLUTION_FAILED, 
          errorDetailsContext
        );
      }

      const stateChanges: StateChanges = {
        variables: {
          [identifier]: {
            type: VariableType.TEXT,
            value: resolvedValue,
            metadata: {
              createdAt: Date.now(),
              modifiedAt: Date.now(),
              origin: VariableOrigin.DIRECT_DEFINITION
            }
          }
        }
      };

      logger.debug(`[${this.kind}] Defined variable`, {
        identifier,
        type: VariableType.TEXT,
        value: resolvedValue,
        location: node.location?.start,
      });

      return { stateChanges };
    } catch (error) {
      logger.error('Error processing text directive:', error);
      if (error instanceof DirectiveError) {
        throw error;
      }
      
      throw new DirectiveError(
        `Unexpected error processing text directive for identifier '${
          identifier ?? 'unknown'
        }': ${error instanceof Error ? error.message : String(error)}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        { ...errorDetailsContext, cause: error instanceof Error ? error : undefined }
      );
    }
  }
} 