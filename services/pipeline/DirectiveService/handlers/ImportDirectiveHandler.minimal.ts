import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.new';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.new';
import { injectable, inject } from 'tsyringe';
import { MeldError, ErrorSeverity } from '@core/errors';

/**
 * ImportDirectiveHandler using new minimal interfaces.
 * 
 * Handles @import directives - imports variables from other Meld files.
 * Supports importing all variables or specific selections.
 */
@injectable()
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';
  
  constructor(
    @inject('IResolutionService') private resolution: IResolutionService,
    @inject('IFileSystemService') private fileSystem: IFileSystemService,
    @inject('IParserService') private parser: IParserService,
    @inject('IInterpreterService') private interpreter: IInterpreterService
  ) {}
  
  async handle(
    directive: DirectiveNode,
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<DirectiveResult> {
    const subtype = directive.subtype;
    
    // Create resolution context
    const resolutionContext: ResolutionContext = {
      state: state,
      basePath: options.filePath 
        ? options.filePath.substring(0, options.filePath.lastIndexOf('/') || 0)
        : process.cwd(),
      currentFilePath: options.filePath || process.cwd()
    };
    
    // Get the source path
    const source = directive.source;
    if (!source || source.type !== 'path') {
      throw new MeldError('Import directive missing source path', {
        code: 'IMPORT_MISSING_SOURCE',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Resolve the import path
    const pathString = await this.resolution.resolve({
      value: source.path,
      context: resolutionContext,
      type: 'path'
    });
    const resolvedPath = await this.resolution.resolvePath(pathString, resolutionContext);
    
    // Read and parse the imported file
    const fileContent = await this.fileSystem.readFile(resolvedPath);
    const parseResult = this.parser.parse(fileContent);
    
    if (parseResult.parseErrors && parseResult.parseErrors.length > 0) {
      throw new MeldError(`Failed to parse import file: ${resolvedPath}`, {
        code: 'IMPORT_PARSE_ERROR',
        severity: ErrorSeverity.Fatal,
        details: { errors: parseResult.parseErrors }
      });
    }
    
    // Create a child state for the imported file
    const childState = state.createChild();
    childState.currentFilePath = resolvedPath;
    
    // Interpret the imported file in the child state
    const interpretResult = await this.interpreter.interpret(
      parseResult.nodes,
      {
        transformationEnabled: options.strict,
        outputFormat: 'text'
      },
      childState
    );
    
    // Extract variables based on import type
    const importedVariables: Record<string, any> = {};
    
    if (subtype === 'importAll') {
      // Import all variables
      const allVars = interpretResult.state.getAllVariables();
      allVars.forEach((variable, name) => {
        importedVariables[name] = variable;
      });
      
    } else if (subtype === 'importSelected') {
      // Import specific selections
      const selections = directive.selections;
      if (!selections || selections === '*') {
        // Import all if * is specified
        const allVars = interpretResult.state.getAllVariables();
        allVars.forEach((variable, name) => {
          importedVariables[name] = variable;
        });
      } else if (Array.isArray(selections)) {
        // Import specific variables
        selections.forEach(selection => {
          const varName = selection.trim();
          const variable = interpretResult.state.getVariable(varName);
          if (variable) {
            importedVariables[varName] = variable;
          } else if (options.strict) {
            throw new MeldError(`Import variable not found: ${varName}`, {
              code: 'IMPORT_VARIABLE_NOT_FOUND',
              severity: ErrorSeverity.Fatal
            });
          }
        });
      }
    }
    
    // Handle rename if specified
    if (directive.rename && Object.keys(importedVariables).length === 1) {
      const oldName = Object.keys(importedVariables)[0];
      const newName = directive.rename;
      importedVariables[newName] = importedVariables[oldName];
      delete importedVariables[oldName];
    }
    
    // Return the imported variables as state changes
    return {
      stateChanges: {
        variables: importedVariables
      }
    };
  }
}