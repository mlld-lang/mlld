import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { injectable, inject } from 'tsyringe';
import { MeldImportError } from '@core/errors';

/**
 * Minimal ImportDirectiveHandler implementation.
 * 
 * Processes @import directives and returns state changes.
 * Imports variables from other Meld files.
 */
@injectable()
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';
  
  constructor(
    @inject('IResolutionService') private resolution: IResolutionService,
    @inject('IParserService') private parser: IParserService,
    @inject('IInterpreterService') private interpreter: IInterpreterService,
    @inject('IFileSystemService') private fileSystem: IFileSystemService,
    @inject('IPathService') private pathService: IPathService
  ) {}
  
  async handle(
    directive: DirectiveNode,
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<DirectiveResult> {
    // Create resolution context
    const resolutionContext = {
      strict: options.strict,
      currentPath: options.filePath
    };
    
    // Get the path to import from
    const pathNodes = directive.values.path;
    if (!pathNodes) {
      throw new Error('Import directive missing path');
    }
    
    const importPath = await this.resolution.resolveNodes(
      pathNodes,
      resolutionContext
    );
    
    // Resolve to absolute path
    const absolutePath = this.pathService.resolvePath(importPath, options.filePath);
    
    // Check if file exists
    const exists = await this.fileSystem.exists(absolutePath);
    if (!exists) {
      throw new MeldImportError(`Import file not found: ${absolutePath}`, {
        code: 'FILE_NOT_FOUND',
        path: absolutePath
      });
    }
    
    // Read and parse the file
    const content = await this.fileSystem.readFile(absolutePath);
    const ast = await this.parser.parse(content, { filePath: absolutePath });
    
    // Interpret the imported file to get its state
    const importedState = await this.interpreter.interpret(ast.nodes, {
      ...options,
      filePath: absolutePath
    });
    
    // Extract variables based on import type
    const variables: Record<string, any> = {};
    
    if (directive.subtype === 'importAll') {
      // Import all variables
      const allVars = importedState.getAllVariables();
      allVars.forEach((variable, name) => {
        variables[name] = variable;
      });
    } else if (directive.subtype === 'importSelected') {
      // Import selected variables
      const selections = directive.raw.selections || [];
      for (const selection of selections) {
        const variable = importedState.getVariable(selection);
        if (!variable) {
          if (options.strict) {
            throw new MeldImportError(`Variable not found in import: ${selection}`, {
              code: 'VARIABLE_NOT_FOUND',
              path: absolutePath,
              variable: selection
            });
          }
          // Skip missing variable in non-strict mode
          continue;
        }
        variables[selection] = variable;
      }
    }
    
    // Return state changes with imported variables
    return {
      stateChanges: {
        variables
      }
    };
  }
}