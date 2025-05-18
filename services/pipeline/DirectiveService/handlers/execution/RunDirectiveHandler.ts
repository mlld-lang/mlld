import type { 
  DirectiveNode, 
  MeldNode, 
  TextNode, 
  VariableReferenceNode,
  RunDirectiveNode
} from '@core/ast/types';
import type { InterpolatableValue } from '@core/ast/types/nodes';
import { NodeType } from '@core/ast/types/nodes';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { directiveLogger as logger } from '@core/utils/logger';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import { ErrorSeverity, MeldError, MeldResolutionError, FieldAccessError } from '@core/errors';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { PathValidationError } from '@core/errors';
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { DirectiveProcessingContext, ResolutionContext } from '@core/types';
import type { ICommandDefinition, IBasicCommandDefinition } from '@core/types/exec';
import { isBasicCommand } from '@core/types/exec';
import type { SourceLocation } from '@core/types/common';
import { 
  type VariableMetadata, 
  VariableOrigin, 
  VariableType,
  type VariableDefinition,
  createTextVariable,
  type CommandVariable,
  type TextVariable
} from '@core/types/variables';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { JsonValue } from '@core/types/common';

/**
 * Handler for @run directives
 * Executes commands and stores their output in state
 */
@injectable()
@Service({
  description: 'Handler for @run directives'
})
export class RunDirectiveHandler implements IDirectiveHandler {
  kind = 'run' as const;

  protected logger = logger;
  protected validationService!: IValidationService;
  protected resolutionService!: IResolutionService;
  protected stateService!: IStateService;
  protected fileSystemService!: IFileSystemService;

  initialize(dependencies: {
    validationService: IValidationService;
    resolutionService: IResolutionService;
    stateService: IStateService;
    fileSystemService: IFileSystemService;
    logger?: typeof logger;
  }): void {
    this.validationService = dependencies.validationService;
    this.resolutionService = dependencies.resolutionService;
    this.stateService = dependencies.stateService;
    this.fileSystemService = dependencies.fileSystemService;
    if (dependencies.logger) {
      this.logger = dependencies.logger;
    }
  }

  async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    const state: IStateService = context.state;
    const node = context.directiveNode as RunDirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    const baseErrorDetails = { 
      node,
      context
    }; 
    
    let tempFilePath: string | undefined;

    try {
      if (!node || node.kind !== 'run') {
          throw new DirectiveError('Invalid node type provided to RunDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
      }
      
      const { subtype, values, raw } = node;
      let commandToExecute: string = ''; // Initialize to satisfy compiler
      let commandArgs: string[] = [];
      const execOptions = { cwd: context.executionContext?.cwd || await this.fileSystemService.getCwd() };
      
      // Extract output variables from values  
      let outputVariable = 'stdout';
      let errorVariable = 'stderr';
      
      if (values.outputVariable && values.outputVariable.length > 0) {
        const outputVarNode = values.outputVariable[0];
        outputVariable = outputVarNode.type === 'Text' ? outputVarNode.content : outputVarNode.identifier;
      }
      
      if (values.errorVariable && values.errorVariable.length > 0) {
        const errorVarNode = values.errorVariable[0];
        errorVariable = errorVarNode.type === 'Text' ? errorVarNode.content : errorVarNode.identifier;
      }

      // --- Resolution Block --- 
      try {
          if (subtype === 'runCommand') {
            // For runCommand, get command from values
            if (values.command) {
              commandToExecute = await this.resolutionService.resolveNodes(values.command, resolutionContext);
            } else if (raw.command) {
              commandToExecute = raw.command;
            }
          } else if (subtype === 'runExec') {
             // For runExec, resolve the command identifier
             const identifier = values.identifier?.[0]?.content || raw.identifier;
             if (!identifier) {
               throw new DirectiveError('No command identifier provided for runExec', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
             }
             
             const commandDef = await this.resolutionService.resolveVariableInContext(identifier, resolutionContext);
             
             if (!commandDef) {
               throw new DirectiveError(`Undefined command reference: ${identifier}`, this.kind, DirectiveErrorCode.VARIABLE_NOT_FOUND, baseErrorDetails);
             }
             
             if (typeof commandDef === 'object' && 'command' in commandDef) {
               commandToExecute = commandDef.command;
               
               // Handle parameters if provided
               if (values.args && values.args.length > 0) {
                 const resolvedArgs = await Promise.all(
                   values.args.map(arg => {
                     if (arg.type === 'Text') {
                       return this.resolutionService.resolveInContext(arg.content, resolutionContext);
                     } else if (arg.type === 'VariableReference') {
                       return this.resolutionService.resolveVariableInContext(arg.identifier, resolutionContext);
                     }
                     return '';
                   })
                 );
                 
                 // Replace parameters in the command
                 commandDef.parameters?.forEach((param: string, index: number) => {
                   if (resolvedArgs[index] !== undefined) {
                     // Replace $1, $2 etc with resolved values
                     commandToExecute = commandToExecute.replace(new RegExp(`\\$${index + 1}`, 'g'), resolvedArgs[index]);
                     // Also replace named parameters if they exist
                     commandToExecute = commandToExecute.replace(new RegExp(`\\$${param}`, 'g'), resolvedArgs[index]);
                   }
                 });
               }
             } else {
               throw new DirectiveError(`Invalid command definition for '${identifier}'`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
             }
          } else if (subtype === 'runCode' || subtype === 'runCodeParams') {
            // For runCode/runCodeParams, extract language and code
            const language = values.lang?.[0]?.content || raw.lang || 'bash';
            const codeContent = values.code?.[0]?.content || raw.code || '';
            
            if (!codeContent) {
              throw new DirectiveError('No code content provided for runCode', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
            }
            
            // For some languages like 'echo', 'ls', etc, run directly as commands
            if (this.isSimpleCommand(language)) {
              commandToExecute = `${language} ${codeContent}`;
            } else {
              // Create temporary file with appropriate extension
              const extension = this.getLanguageExtension(language);
              const tempDir = context.executionContext?.tempDir || os.tmpdir();
              const randomId = randomBytes(8).toString('hex');
              tempFilePath = path.join(tempDir, `meld_${randomId}${extension}`);
              
              // Write code to temp file
              await this.fileSystemService.writeFile(tempFilePath, codeContent);
              
              // Determine command based on language
              const interpreter = this.getLanguageInterpreter(language);
              commandToExecute = `${interpreter} ${tempFilePath}`;
            }
            
            // Handle code parameters if provided
            if (subtype === 'runCodeParams' && values.args && values.args.length > 0) {
              const resolvedArgs = await Promise.all(
                values.args.map(arg => this.resolutionService.resolveNodes([arg], resolutionContext))
              );
              commandToExecute += ` ${resolvedArgs.join(' ')}`;
            }
          }
          
      } catch (resolutionError) {
          if (resolutionError instanceof DirectiveError) throw resolutionError;
          const cause = resolutionError instanceof Error ? resolutionError : undefined;
          throw new DirectiveError(
            `Failed to resolve command string or parameters`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            { ...baseErrorDetails, cause }
          );
      }

      // --- Execution Block --- 
      let stdout: string, stderr: string;
      try {
          if (!commandToExecute || commandToExecute.trim() === '') {
            throw new DirectiveError('Run directive command resolved to an empty string', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
          }

          const result = await this.fileSystemService.executeCommand(commandToExecute, execOptions);
          stdout = result.stdout;
          stderr = result.stderr;
      } catch (executionError) {
           const cause = executionError instanceof Error ? executionError : new Error(String(executionError));
           throw new DirectiveError(
             `Failed to execute command: ${cause.message}`,
             this.kind,
             DirectiveErrorCode.EXECUTION_FAILED,
             { ...baseErrorDetails, cause }
           );
      }

      // Create variable definitions for stdout and stderr
      const sourceLocation: SourceLocation | undefined = node.location ? {
        filePath: currentFilePath ?? 'unknown',
        line: node.location.start.line,
        column: node.location.start.column
      } : undefined;

      const variables: Record<string, VariableDefinition> = {};

      // Add stdout variable if we have output
      if (stdout !== undefined) {
        variables[outputVariable] = {
          type: VariableType.TEXT,
          value: stdout,
          metadata: {
            origin: VariableOrigin.DIRECTIVE,
            directiveKind: 'run',
            directiveId: node.nodeId,
            sourceLocation,
            timestamp: Date.now()
          }
        };
      }

      // Add stderr variable if we have error output
      if (stderr !== undefined) {
        variables[errorVariable] = {
          type: VariableType.TEXT,
          value: stderr,
          metadata: {
            origin: VariableOrigin.DIRECTIVE,
            directiveKind: 'run',
            directiveId: node.nodeId,
            sourceLocation,
            timestamp: Date.now()
          }
        };
      }

      // In transformation mode, return stdout and stderr as replacement
      let replacement = undefined;
      if (state.isTransformationEnabled()) {
        let content = '';
        if (stdout !== undefined) {
          content = stdout;
        }
        if (stderr !== undefined && stderr !== '') {
          content = content ? `${content}\n${stderr}` : stderr;
        }
        if (content) {
          replacement = [{
            type: 'Text' as const,
            nodeId: `${node.nodeId}-output`,
            content,
            location: node.location
          }];
        }
      }

      return {
        stateChanges: variables,
        replacement
      };

    } finally {
      // Clean up temp file if created
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (error) {
          // Log but don't throw - cleanup errors shouldn't fail the directive
          this.logger.warn(`Failed to clean up temp file: ${tempFilePath}`, { error });
        }
      }
    }
  }

  private getLanguageExtension(language: string): string {
    const extensions: Record<string, string> = {
      'python': '.py',
      'javascript': '.js', 
      'js': '.js',
      'typescript': '.ts',
      'ts': '.ts',
      'bash': '.sh',
      'sh': '.sh',
      'ruby': '.rb',
      'perl': '.pl',
      'php': '.php',
      'java': '.java',
      'c': '.c',
      'cpp': '.cpp',
      'csharp': '.cs',
      'cs': '.cs',
      'go': '.go',
      'rust': '.rs',
      'swift': '.swift',
      'kotlin': '.kt'
    };
    return extensions[language.toLowerCase()] || '.txt';
  }

  private getLanguageInterpreter(language: string): string {
    const interpreters: Record<string, string> = {
      'python': 'python3',
      'javascript': 'node',
      'js': 'node',
      'typescript': 'ts-node',
      'ts': 'ts-node',
      'bash': 'bash',
      'sh': 'sh',
      'ruby': 'ruby',
      'perl': 'perl',
      'php': 'php',
      'java': 'java',
      'c': 'gcc -o /tmp/a.out && /tmp/a.out',
      'cpp': 'g++ -o /tmp/a.out && /tmp/a.out',
      'csharp': 'csc',
      'cs': 'csc',
      'go': 'go run',
      'rust': 'rustc',
      'swift': 'swift',
      'kotlin': 'kotlinc'
    };
    return interpreters[language.toLowerCase()] || language;
  }

  private isSimpleCommand(language: string): boolean {
    // These are common shell commands that should be run directly
    const simpleCommands = [
      'echo', 'ls', 'cp', 'mv', 'rm', 'cd', 'pwd', 'mkdir', 'rmdir',
      'cat', 'grep', 'sed', 'awk', 'find', 'which', 'curl', 'wget',
      'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'chmod', 'chown',
      'ps', 'kill', 'df', 'du', 'top', 'date', 'cal', 'whoami',
      'git', 'npm', 'yarn', 'pip', 'brew', 'apt', 'yum', 'dnf'
    ];
    return simpleCommands.includes(language.toLowerCase());
  }
}