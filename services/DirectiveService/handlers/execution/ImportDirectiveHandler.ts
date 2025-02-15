import { DirectiveNode, ImportDirective } from 'meld-spec';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

import { IDirectiveHandler } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { IFileSystemService } from '../../../FileSystemService/IFileSystemService';
import { IParserService } from '../../../ParserService/IParserService';
import { IInterpreterService } from '../../../InterpreterService/IInterpreterService';
import { ICircularityService } from '../../../CircularityService/ICircularityService';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';
import { directiveLogger as logger } from '../../../../core/utils/logger';

/**
 * Handler for @import directives
 * Imports and processes Meld files, merging their state into the current interpreter state.
 * Supports:
 * - Basic imports: @import [file.meld]
 * - Explicit imports: @import [x,y,z] from [file.meld]
 * - Aliased imports: @import [x as y] from [file.meld]
 * - Wildcard imports: @import [*] from [file.meld]
 */
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private circularityService: ICircularityService
  ) {}

  async execute(node: DirectiveNode, context: { currentFilePath?: string }): Promise<void> {
    const directive = node.directive as ImportDirective;
    const location = node.location;

    try {
      // 1. Validate the directive structure
      await this.validationService.validate(node);

      // 2. Parse import syntax (source and optional imports)
      const { source, imports } = this.parseImportSyntax(directive);

      // 3. Resolve the path with proper context
      const resolvedPath = await this.resolutionService.resolvePath(source, {
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        },
        pathValidation: {
          requireAbsolute: true,
          allowedRoots: ['$PROJECTPATH', '$HOMEPATH']
        },
        location
      });

      // 4. Check if file exists
      if (!await this.fileSystemService.exists(resolvedPath)) {
        throw new DirectiveError(
          `Import file not found: ${source}`,
          'import',
          DirectiveErrorCode.FILE_NOT_FOUND,
          { path: resolvedPath }
        );
      }

      // 5. Check for circular imports
      try {
        await this.circularityService.beginImport(resolvedPath);
      } catch (error) {
        if (error instanceof DirectiveError) {
          throw error;
        }
        throw new DirectiveError(
          'Circular import detected',
          'import',
          DirectiveErrorCode.CIRCULAR_REFERENCE,
          { path: resolvedPath }
        );
      }

      try {
        // 6. Read and parse the file
        const content = await this.fileSystemService.readFile(resolvedPath);
        const nodes = await this.parserService.parse(content, resolvedPath);

        // 7. Create child state for import
        const importState = this.stateService.createChildState();

        // 8. Process the imported content
        await this.interpreterService.interpret(nodes, {
          initialState: importState,
          filePath: resolvedPath,
          mergeState: true,
          importFilter: imports // Pass import filter for selective imports
        });

        // 9. Handle import filtering and aliasing
        if (imports && imports.length > 0) {
          await this.processImportFilters(imports, importState);
        }

        // 10. Merge the filtered state back to parent
        await this.stateService.mergeStates(importState);

      } finally {
        // Always end import tracking, even on error
        await this.circularityService.endImport(resolvedPath);
      }

    } catch (error) {
      // Wrap any non-DirectiveError in a DirectiveError
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        `Import failed: ${error.message}`,
        'import',
        DirectiveErrorCode.EXECUTION_FAILED,
        { 
          cause: error,
          location: node.location
        }
      );
    }
  }

  /**
   * Parse the import syntax to extract source and optional imports
   */
  private parseImportSyntax(directive: ImportDirective): { 
    source: string;
    imports?: Array<{ name: string; alias?: string }>;
  } {
    // Handle shorthand syntax: @import [file.meld]
    if (!directive.from) {
      return { source: directive.path };
    }

    // Handle full syntax: @import [x,y,z] from [file.meld]
    return {
      source: directive.from,
      imports: this.parseImportList(directive.path)
    };
  }

  /**
   * Parse the import list syntax for explicit imports
   */
  private parseImportList(importList: string): Array<{ name: string; alias?: string }> {
    // Handle wildcard import
    if (importList === '*') {
      return [];
    }

    // Parse comma-separated list
    return importList.split(',').map(item => {
      const [name, alias] = item.trim().split(/\s+as\s+/);
      return { name, alias };
    });
  }

  /**
   * Process import filters and aliases
   */
  private async processImportFilters(
    imports: Array<{ name: string; alias?: string }>,
    importState: IStateService
  ): Promise<void> {
    for (const { name, alias } of imports) {
      // Check if variable exists in imported state
      if (!importState.hasVariable(name)) {
        throw new DirectiveError(
          `Imported variable not found: ${name}`,
          'import',
          DirectiveErrorCode.VARIABLE_NOT_FOUND
        );
      }

      // Handle aliasing
      if (alias) {
        const value = importState.getVariable(name);
        importState.setVariable(alias, value);
        importState.removeVariable(name);
      }
    }
  }
} 