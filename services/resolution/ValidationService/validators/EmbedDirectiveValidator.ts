import type { DirectiveNode, EmbedDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

export function validateEmbedDirective(node: DirectiveNode): void {
  const directive = node.directive as EmbedDirective;
  
  // Check required fields from meld-spec
  if (!directive.path || typeof directive.path !== 'string') {
    throw new MeldDirectiveError(
      'Embed directive requires a "path" property (string)',
      'embed',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Path cannot be empty
  if (directive.path.trim() === '') {
    throw new MeldDirectiveError(
      'Embed directive path cannot be empty',
      'embed',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Optional fields validation
  if (directive.section !== undefined && typeof directive.section !== 'string') {
    throw new MeldDirectiveError(
      'Embed directive "section" property must be a string if provided',
      'embed',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  if (directive.fuzzy !== undefined) {
    if (typeof directive.fuzzy !== 'number' || directive.fuzzy < 0 || directive.fuzzy > 1) {
      throw new MeldDirectiveError(
        'Embed directive "fuzzy" property must be a number between 0 and 1 if provided',
        'embed',
        node.location?.start,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }
  
  if (directive.format !== undefined && typeof directive.format !== 'string') {
    throw new MeldDirectiveError(
      'Embed directive "format" property must be a string if provided',
      'embed',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
} 