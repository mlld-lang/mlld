import type { DirectiveNode } from '@core/ast/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';
import { DirectiveLocation } from '@core/errors/MeldDirectiveError';

/**
 * Converts AST SourceLocation to DirectiveLocation
 */
function convertLocation(location: any): DirectiveLocation {
  if (!location) return { line: 0, column: 0 };
  return {
    line: location.line,
    column: location.column
  };
}

/**
 * Validates @text directives according to spec
 * Works with new AST structure where content is in typed nodes
 */
export function validateTextDirective(node: DirectiveNode): void {
  // With new AST structure, directives have flattened properties
  if (!node.kind || node.kind !== 'text') {
    throw new MeldDirectiveError(
      'Expected text directive',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Check for identifier in values
  if (!node.values?.identifier || !Array.isArray(node.values.identifier) || 
      node.values.identifier.length === 0) {
    throw new MeldDirectiveError(
      'Text directive requires an "identifier" property (string)',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Check if identifier is empty
  const identifierNode = node.values.identifier[0];
  const identifier = identifierNode.identifier;
  
  if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
    throw new MeldDirectiveError(
      'Text directive requires an "identifier" property (string)',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Validate identifier format - now checking the actual identifier value
  const firstChar = identifier.charAt(0);
  if (!/[a-zA-Z_]/.test(firstChar)) {
    throw new MeldDirectiveError(
      'Text directive identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Check for content in values
  if (!node.values?.content || !Array.isArray(node.values.content) || 
      node.values.content.length === 0) {
    throw new MeldDirectiveError(
      'Text directive requires a non-empty "value" property',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Check if content is empty string
  const contentValue = node.values.content[0];
  if (contentValue.type === 'Text' && contentValue.content === '') {
    throw new MeldDirectiveError(
      'Text directive requires a non-empty "value" property',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Handle special source types (@add, @run values)
  if (node.raw?.content && typeof node.raw.content === 'string') {
    // Check for @add format
    if (node.raw.content.startsWith('@add')) {
      const valueAfterEmbed = node.raw.content.substring('@add'.length).trim();
      if (!(valueAfterEmbed.startsWith('[') && valueAfterEmbed.endsWith(']'))) {
        throw new MeldDirectiveError(
          'Invalid @add format in text directive. Must be "@add [path]"',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
    }
    // Check for @run format
    else if (node.raw.content.startsWith('@run')) {
      const valueAfterRun = node.raw.content.substring('@run'.length).trim();
      if (!(valueAfterRun.startsWith('[') && valueAfterRun.endsWith(']'))) {
        throw new MeldDirectiveError(
          'Invalid @run format in text directive. Must be "@run [command]"',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
    }
  }
}