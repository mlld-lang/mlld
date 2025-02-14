import { DirectiveNode, ImportDirective } from 'meld-spec';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { IFileSystemService } from '../../../FileSystemService/IFileSystemService';
import { IParserService } from '../../../ParserService/IParserService';
import { IInterpreterService } from '../../../InterpreterService/IInterpreterService';
import { ICircularityService } from '../../../CircularityService/ICircularityService';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';

/**
 * Handler for @import directives
 * Imports and processes Meld files
 */
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private circularityService: ICircularityService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    // TODO: Per UX.md, @import must follow pattern: import [x,y,z] from [file.md] or import [x as y] from [file.md]
    // Current implementation doesn't support this syntax

    // TODO: Per UX.md, imports must appear at top of file
    // Current implementation doesn't enforce this

    // TODO: Per UX.md, all paths must be absolute via $HOMEPATH/$PROJECTPATH
    // Current implementation allows relative paths

    // TODO: Per UX.md, error handling should be silent in build output but warn on command line
    // Current implementation throws errors directly

    // 1. Validate directive structure
    await this.validationService.validate(node);

    // 2. Extract path
    const directive = node.directive as ImportDirective;
    const { path } = directive;

    // TODO: Use ResolutionContextFactory.forImportDirective() as specified in service-directive.md
    // 3. Create resolution context
    const resolutionContext = ResolutionContextFactory.forImportDirective(
      context.currentFilePath
    );

    // TODO: Per arch--overview.md, ResolutionService should handle ALL variable resolution
    // 4. Resolve path
    const resolvedPath = await this.resolutionService.resolvePath(
      path,
      resolutionContext
    );

    // 5. Check for circular imports
    this.circularityService.beginImport(resolvedPath);

    try {
      // TODO: Per arch--overview.md, PathService should validate resolved paths
      // Current implementation mixes path validation with existence checks
      // 6. Check if file exists
      if (!await this.fileSystemService.exists(resolvedPath)) {
        throw new DirectiveError(
          `Import file not found: ${resolvedPath}`,
          'import',
          DirectiveErrorCode.RESOLUTION_FAILED,
          { node, context }
        );
      }

      // TODO: Use meld-ast parser for proper AST handling
      // 7. Read and parse file
      const content = await this.fileSystemService.readFile(resolvedPath);
      const nodes = await this.parserService.parse(content);

      // TODO: Per service-directive.md, state management should be handled by StateService
      // 8. Create child state
      const childState = await this.stateService.createChildState();

      // TODO: Per UX.md, support both explicit imports and * import
      // 9. Interpret imported content
      await this.interpreterService.interpret(nodes, {
        initialState: childState,
        filePath: resolvedPath,
        mergeState: true
      });
    } finally {
      // Always end import tracking
      this.circularityService.endImport(resolvedPath);
    }
  }
} 