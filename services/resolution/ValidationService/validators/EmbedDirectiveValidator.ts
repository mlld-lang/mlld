import type { DirectiveNode, EmbedDirectiveData } from '@core/syntax/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';

export function validateEmbedDirective(node: DirectiveNode): void {
  const directive = node.directive as EmbedDirectiveData;
  
  // Grammar has already validated basic syntax and structure
  // We need to validate AST nodes based on subtype
  
  switch (directive.subtype) {
    case 'embedPath':
      // Grammar validates path format, but we need to check the AST nodes
      if (!directive.path || (!directive.path.raw && !directive.path.interpolatedValue)) {
        throw new MeldDirectiveError(
          'Embed path directive requires a valid path',
          'embed',
          { 
            location: node.location?.start,
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
      break;
      
    case 'embedVariable':
      // Grammar validates variable format, but we need to check the AST nodes
      if (!directive.path || !directive.path.variable) {
        throw new MeldDirectiveError(
          'Embed variable directive requires a valid variable reference',
          'embed',
          {
            location: node.location?.start,
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
      break;
      
    case 'embedTemplate':
      // Grammar validates template format and variable nodes
      // We just need to check that content exists
      if (!directive.content) {
        throw new MeldDirectiveError(
          'Embed template directive requires content',
          'embed',
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
        `Unknown embed subtype: ${directive.subtype}`,
        'embed',
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
  }
}