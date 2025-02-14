import { DirectiveNode, ImportDirective } from 'meld-spec';
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
    // 1. Validate directive structure
    await this.validationService.validate(node);

    // 2. Extract path
    const directive = node.directive as ImportDirective;
    const { path } = directive;

    // 3. Create resolution context
    const resolutionContext = ResolutionContextFactory.forImportDirective(
      context.currentFilePath
    );

    // 4. Resolve path
    const resolvedPath = await this.resolutionService.resolvePath(
      path,
      resolutionContext
    );

    // 5. Check for circular imports
    this.circularityService.beginImport(resolvedPath);

    try {
      // 6. Check if file exists
      if (!await this.fileSystemService.exists(resolvedPath)) {
        throw new DirectiveError(
          `Import file not found: ${resolvedPath}`,
          'import',
          DirectiveErrorCode.RESOLUTION_FAILED,
          { node, context }
        );
      }

      // 7. Read and parse file
      const content = await this.fileSystemService.readFile(resolvedPath);
      const nodes = await this.parserService.parse(content);

      // 8. Create child state
      const childState = await this.stateService.createChildState();

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