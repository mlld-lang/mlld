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

/**
 * Handler for @import directives
 * Imports and processes Meld files
 */
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private interpreterService: IInterpreterService
  ) {}

  async execute(node: DirectiveNode): Promise<void> {
    const directive = node.directive as ImportDirective;
    
    // 1. Validate the directive
    await this.validationService.validate(node);
    
    // 2. Resolve the path and any variables
    const resolvedPath = await this.resolutionService.resolvePath(directive.path, {
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
    
    // 3. Get the content
    const content = await this.resolutionService.resolveContent(resolvedPath);
    
    // 4. Create a new state for the imported content
    const importState = this.stateService.createChildState();
    
    // 5. Interpret the imported content
    await this.interpreterService.interpret(content, {
      initialState: importState,
      filePath: resolvedPath
    });
    
    // 6. Merge the import state back into the parent
    await this.stateService.mergeStates(importState);
  }
} 