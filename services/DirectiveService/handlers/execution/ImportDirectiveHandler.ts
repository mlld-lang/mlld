import { DirectiveNode } from 'meld-spec';
import type { DirectiveContext, IDirectiveHandler } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

// Define the ImportDirective interface
interface ImportDirective {
  kind: 'import';
  identifier: string;
  value: string;
}

/**
 * Handler for @import directives
 * Imports and processes Meld files, merging their state into the current interpreter state.
 * Supports:
 * - Basic imports: @import [file.meld]
 * - Explicit imports: @import [x,y,z] from [file.meld]
 * - Aliased imports: @import [x as y] from [file.meld]
 * - Wildcard imports: @import [*] from [file.meld]
 * 
 * Legacy format (deprecated):
 * - @import path = "file.meld"
 * - @import imports = [x,y,z] path = "file.meld"
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

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    const directive = node.directive as ImportDirective;

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
        }
      });

      // 4. Check if file exists
      if (!await this.fileSystemService.exists(resolvedPath)) {
        throw new DirectiveError(
          `Import file not found: ${source}`,
          'import',
          DirectiveErrorCode.FILE_NOT_FOUND,
          { node, context }
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
          { node, context }
        );
      }

      try {
        // 6. Read and parse the file
        const content = await this.fileSystemService.readFile(resolvedPath);
        if (!content) {
          throw new DirectiveError(
            'Import file is empty',
            'import',
            DirectiveErrorCode.VALIDATION_FAILED,
            { node, context }
          );
        }

        const nodes = await this.parserService.parseWithLocations(content, resolvedPath);
        if (!nodes || !Array.isArray(nodes)) {
          throw new DirectiveError(
            'Failed to parse imported content',
            'import',
            DirectiveErrorCode.VALIDATION_FAILED,
            { node, context }
          );
        }

        // 7. Create child state for import
        const importState = this.stateService.createChildState();
        if (!importState) {
          throw new DirectiveError(
            'Failed to create child state for import',
            'import',
            DirectiveErrorCode.STATE_ERROR,
            { node, context }
          );
        }

        // 8. Process the imported content
        const importFilter = imports?.some(imp => imp.identifier === '*') ? undefined : imports?.map(imp => imp.identifier);
        const processedState = await this.interpreterService.interpret(nodes, {
          initialState: importState,
          filePath: resolvedPath,
          mergeState: true,
          importFilter
        });

        // 9. Handle import filtering and aliasing
        if (imports && imports.length > 0 && !imports.some(imp => imp.identifier === '*')) {
          // Check if all required variables exist
          for (const imp of imports) {
            // Skip wildcard imports
            if (imp.identifier === '*') continue;
            
            // Check all variable types
            const hasVar = processedState.getTextVar(imp.identifier) !== undefined ||
                         processedState.getDataVar(imp.identifier) !== undefined ||
                         processedState.getPathVar(imp.identifier) !== undefined;
            
            if (!hasVar) {
              throw new DirectiveError(
                `Imported variable not found: ${imp.identifier}`,
                'import',
                DirectiveErrorCode.VARIABLE_NOT_FOUND,
                { node, context }
              );
            }

            // Handle aliasing
            if (imp.alias) {
              // Try each variable type
              const textValue = processedState.getTextVar(imp.identifier);
              if (textValue !== undefined) {
                processedState.setTextVar(imp.alias, textValue);
                continue;
              }

              const dataValue = processedState.getDataVar(imp.identifier);
              if (dataValue !== undefined) {
                processedState.setDataVar(imp.alias, dataValue);
                continue;
              }

              const pathValue = processedState.getPathVar(imp.identifier);
              if (pathValue !== undefined) {
                processedState.setPathVar(imp.alias, pathValue);
              }
            }
          }
        }

        // 10. Merge the processed state back to parent
        await this.stateService.mergeChildState(processedState);

      } finally {
        // Always end import tracking, even on error
        await this.circularityService.endImport(resolvedPath);
      }

    } catch (error) {
      // Wrap any non-DirectiveError in a DirectiveError
      if (error instanceof DirectiveError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new DirectiveError(
        `Import failed: ${message}`,
        'import',
        DirectiveErrorCode.EXECUTION_FAILED,
        { node, context, cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Parse import syntax to extract source and optional imports
   */
  private parseImportSyntax(directive: ImportDirective): { 
    source: string;
    imports?: Array<{ identifier: string; alias?: string }>;
  } {
    if (!directive.value) {
      throw new DirectiveError(
        'Import directive requires a path',
        'import',
        DirectiveErrorCode.VALIDATION_FAILED,
        { node: { type: 'Directive', directive } as DirectiveNode }
      );
    }

    // Try new format: @import [x,y,z] from [file.md] or @import [file.md]
    const newFormatMatch = directive.value.match(/^\s*\[([^\]]+)\](?:\s+from\s+\[([^\]]+)\])?\s*$/);
    if (newFormatMatch) {
      const [, importsOrPath, fromPath] = newFormatMatch;
      if (fromPath) {
        // Format: @import [x,y,z] from [file.md]
        return {
          source: fromPath,
          imports: this.parseImportList(importsOrPath)
        };
      } else {
        // Format: @import [file.md]
        return {
          source: importsOrPath,
          imports: [{ identifier: '*' }] // Wildcard import
        };
      }
    }

    // Try old format with path parameter
    const pathMatch = directive.value.match(/path\s*=\s*["']([^"']+)["']/);
    
    if (!pathMatch) {
      throw new DirectiveError(
        'Invalid import syntax. Expected either @import [file.md] or @import [x,y,z] from [file.md]',
        'import',
        DirectiveErrorCode.VALIDATION_FAILED,
        { node: { type: 'Directive', directive } as DirectiveNode }
      );
    }

    const source = pathMatch[1];

    // Check for import list in old format
    const importListMatch = directive.value.match(/imports\s*=\s*\[(.*?)\]/);
    
    if (importListMatch) {
      const importList = importListMatch[1].trim();
      if (importList) {
        return {
          source,
          imports: this.parseImportList(importList)
        };
      }
    }

    return { source };
  }

  /**
   * Parse import list from string
   */
  private parseImportList(importList: string): Array<{ identifier: string; alias?: string }> {
    if (importList === '*') {
      return [{ identifier: '*' }];
    }

    return importList.split(',').map(item => {
      const asMatch = item.trim().match(/^(\S+)(?:\s+as\s+(\S+))?$/);
      if (!asMatch) {
        throw new DirectiveError(
          `Invalid import syntax: ${item}`,
          'import',
          DirectiveErrorCode.VALIDATION_FAILED
        );
      }
      return {
        identifier: asMatch[1],
        alias: asMatch[2]
      };
    });
  }

  /**
   * Process import filters and aliases
   */
  private async processImportFilters(
    imports: Array<{ identifier: string; alias?: string }>,
    importState: IStateService
  ): Promise<void> {
    // Create a map of all variables to check existence first
    const variables = new Set<string>();
    
    for (const { identifier } of imports) {
      // Skip wildcard imports
      if (identifier === '*') {
        continue;
      }
      variables.add(identifier);
    }

    // Check all variables exist before modifying state
    for (const identifier of variables) {
      const exists = importState.getTextVar(identifier) !== undefined ||
                    importState.getDataVar(identifier) !== undefined ||
                    importState.getPathVar(identifier) !== undefined;
      if (!exists) {
        throw new DirectiveError(
          `Imported variable not found: ${identifier}`,
          'import',
          DirectiveErrorCode.VALIDATION_FAILED
        );
      }
    }

    // Now handle aliasing
    for (const { identifier, alias } of imports) {
      if (identifier === '*' || !alias) {
        continue;
      }

      // Try to get variable from each type
      const textValue = importState.getTextVar(identifier);
      if (textValue !== undefined) {
        importState.setTextVar(alias, textValue);
        continue;
      }

      const dataValue = importState.getDataVar(identifier);
      if (dataValue !== undefined) {
        importState.setDataVar(alias, dataValue);
        continue;
      }

      const pathValue = importState.getPathVar(identifier);
      if (pathValue !== undefined) {
        importState.setPathVar(alias, pathValue);
      }
    }
  }

  /**
   * Import variables from source state
   */
  private async importVariables(
    imports: Array<{ identifier: string; alias?: string }>,
    sourceState: IStateService,
    targetState: IStateService
  ): Promise<void> {
    for (const { identifier, alias } of imports) {
      // Try to get variable from each type
      const textValue = sourceState.getTextVar(identifier);
      if (textValue !== undefined) {
        await targetState.setTextVar(alias || identifier, textValue);
        continue;
      }

      const dataValue = sourceState.getDataVar(identifier);
      if (dataValue !== undefined) {
        await targetState.setDataVar(alias || identifier, dataValue);
        continue;
      }

      const pathValue = sourceState.getPathVar(identifier);
      if (pathValue !== undefined) {
        await targetState.setPathVar(alias || identifier, pathValue);
        continue;
      }

      throw new DirectiveError(
        `Variable not found in source: ${identifier}`,
        'import',
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }
} 