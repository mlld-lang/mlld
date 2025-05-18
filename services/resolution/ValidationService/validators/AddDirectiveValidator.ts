import type { DirectiveNode, AddDirectiveData } from '@core/syntax/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';

export function validateAddDirective(node: DirectiveNode): void {
  const directive = node.directive as AddDirectiveData;
  
  // Grammar has already validated basic syntax and structure
  // We need to validate AST nodes based on subtype
  
  switch (directive.subtype) {
    case 'addPath':
      // Grammar validates path format, but we need to check the AST nodes
      if (!directive.path || (!directive.path.raw && !directive.path.interpolatedValue)) {
        throw new MeldDirectiveError(
          'Add path directive requires a valid path',
          'add',
          { 
            location: node.location?.start,
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
      break;
      
    case 'addVariable':
      // Grammar validates variable format, but we need to check the AST nodes
      if (!directive.path || !directive.path.variable) {
        throw new MeldDirectiveError(
          'Add variable directive requires a valid variable reference',
          'add',
          {
            location: node.location?.start,
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
      break;
      
    case 'addTemplate':
      // Grammar validates template format and variable nodes
      // We just need to check that content exists
      if (!directive.content) {
        throw new MeldDirectiveError(
          'Add template directive requires content',
          'add',
          {
            location: node.location?.start,
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
      break;
      
    default:
      throw new MeldDirectiveError(
        `Unknown add subtype: ${directive.subtype}`,
        'add',
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
  }
}