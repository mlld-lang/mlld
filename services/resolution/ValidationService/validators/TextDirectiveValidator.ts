import type { DirectiveNode } from '@core/syntax/types.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { DirectiveLocation } from '@core/errors/MeldDirectiveError.js';

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
 * Uses AST-based validation instead of regex
 */
export function validateTextDirective(node: DirectiveNode): void {
  const directive = node.directive;
  
  // <<< Use process.stdout.write for reliable logging >>>
  // process.stdout.write(`\n[validateTextDirective] Input Directive: ${JSON.stringify(directive, null, 2)}\n`);
  
  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
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
  
  // Validate identifier format - check first character and rest separately
  // This is how AST would validate an identifier
  const firstChar = directive.identifier.charAt(0);
  if (!(firstChar === '_' || (firstChar >= 'a' && firstChar <= 'z') || (firstChar >= 'A' && firstChar <= 'Z'))) {
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
  
  // Check the rest of the characters
  for (let i = 1; i < directive.identifier.length; i++) {
    const char = directive.identifier.charAt(i);
    if (!((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || 
          (char >= '0' && char <= '9') || char === '_')) {
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
  }
  
  // Check if this is a text directive with @run or @embed source
  // In this case, the value property might not be set, but source and run/embed properties are
  if (directive.source === 'run' && directive.run) {
    // This is a text directive with @run value
    // No need to validate the value property
  }
  
  if (directive.source === 'embed' && directive.embed) {
    // This is a text directive with @embed value
    // No need to validate the value property
  }
  
  // For all other cases, validate the value property
  // Validate value
  if (directive.value === undefined || directive.value === '') {
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

  // Check if the source is specified
  if (directive.source) {
    // If source is specified, validate it
    if (directive.source !== 'literal' && directive.source !== 'embed' && 
        directive.source !== 'run' && directive.source !== 'call') {
      throw new MeldDirectiveError(
        'Text directive source must be one of: literal, embed, run, call',
        'text',
        {
          location: convertLocation(node.location?.start),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }

    // For call source, validate the value format without regex
    if (directive.source === 'call') {
      // Value should be in format "api.method [path]"
      // Parse components directly without regex
      const parts = directive.value.split(' ');
      const hasMethod = parts[0] && parts[0].includes('.');
      const methodParts = parts[0] ? parts[0].split('.') : [];
      const hasTwoParts = methodParts.length === 2;
      
      // Check api and method naming
      const hasValidApi = hasTwoParts && isValidIdentifier(methodParts[0]);
      const hasValidMethod = hasTwoParts && isValidIdentifier(methodParts[1]);
      
      // Check path format
      const path = parts.slice(1).join(' ').trim();
      const hasValidPath = path.startsWith('[') && path.endsWith(']');
      
      if (!(hasMethod && hasValidApi && hasValidMethod && hasValidPath)) {
        throw new MeldDirectiveError(
          'Invalid call format in text directive. Must be "api.method [path]"',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
    }
    // Validate @embed source value format
    else if (directive.source === 'embed') {
        // Value might not be present if source is correctly parsed into directive.embed
        // If value *is* present, validate it. If not, assume parser handled it (or handler will error).
        if (directive.value && typeof directive.value === 'string') {
            const valueAfterEmbed = directive.value.substring('@embed'.length).trim();
            if (!(valueAfterEmbed.startsWith('[') && valueAfterEmbed.endsWith(']'))) {
                throw new MeldDirectiveError(
                  'Invalid @embed format in text directive value when source=\"embed\". Must be "@embed [path]"', // Adjusted message
                  'text',
                  {
                    location: convertLocation(node.location?.start),
                    code: DirectiveErrorCode.VALIDATION_FAILED,
                    severity: ErrorSeverity.Fatal
                  }
                );
            }
        } else if (!directive.embed) { // If value is missing, ensure embed structure exists
             throw new MeldDirectiveError(
                'Text directive with source=\"embed\" requires either a value starting with @embed or an embed property',
                'text',
                {
                  location: convertLocation(node.location?.start),
                  code: DirectiveErrorCode.VALIDATION_FAILED,
                  severity: ErrorSeverity.Fatal
                }
            );
        }
        // We could add basic validation for directive.embed structure here if needed
    }
    // Validate @run source value format
    else if (directive.source === 'run') {
        // Similar logic: validate value if present, otherwise expect directive.run
        if (directive.value && typeof directive.value === 'string') {
            const valueAfterRun = directive.value.substring('@run'.length).trim();
            if (!(valueAfterRun.startsWith('[') && valueAfterRun.endsWith(']'))) {
                throw new MeldDirectiveError(
                    'Invalid @run format in text directive value when source=\"run\". Must be "@run [command]"', // Adjusted message
                    'text',
                    {
                      location: convertLocation(node.location?.start),
                      code: DirectiveErrorCode.VALIDATION_FAILED,
                      severity: ErrorSeverity.Fatal
                    }
                );
            }
        } else if (!directive.run) { // If value is missing, ensure run structure exists
            throw new MeldDirectiveError(
                'Text directive with source=\"run\" requires either a value starting with @run or a run property',
                'text',
                {
                  location: convertLocation(node.location?.start),
                  code: DirectiveErrorCode.VALIDATION_FAILED,
                  severity: ErrorSeverity.Fatal
                }
            );
        }
        // We could add basic validation for directive.run structure here if needed
    }
    // >>> NEW: Check literal source for value that looks like @embed/@run <<<
    else if (directive.source === 'literal' && directive.value && typeof directive.value === 'string') {
        if (directive.value.startsWith('@embed')) {
            const valueAfterEmbed = directive.value.substring('@embed'.length).trim();
            if (!(valueAfterEmbed.startsWith('[') && valueAfterEmbed.endsWith(']'))) {
                throw new MeldDirectiveError(
                  'Invalid @embed format in text directive value (source=literal). Must be "@embed [path]"', // Adjusted message
                  'text',
                  {
                    location: convertLocation(node.location?.start),
                    code: DirectiveErrorCode.VALIDATION_FAILED,
                    severity: ErrorSeverity.Fatal
                  }
                );
            }
        } else if (directive.value.startsWith('@run')) {
            const valueAfterRun = directive.value.substring('@run'.length).trim();
            if (!(valueAfterRun.startsWith('[') && valueAfterRun.endsWith(']'))) {
                throw new MeldDirectiveError(
                    'Invalid @run format in text directive value (source=literal). Must be "@run [command]"', // Adjusted message
                    'text',
                    {
                      location: convertLocation(node.location?.start),
                      code: DirectiveErrorCode.VALIDATION_FAILED,
                      severity: ErrorSeverity.Fatal
                    }
                );
            }
        } else if (directive.value.startsWith('@call')) {
             // We can potentially add validation for literal @call here too if needed
             // Currently handled by the fallback block below
        }
        // If it's literal and doesn't start with @embed/@run/@call, it falls through to general literal checks later
    }

  } else if (directive.value && typeof directive.value === 'string' && directive.value.startsWith('@')) {
    // For backward compatibility, check if value starts with @
    const validPrefixes = ['@embed', '@run', '@call'];
    const prefix = validPrefixes.find(p => directive.value.startsWith(p));
    
    if (!prefix) {
      throw new MeldDirectiveError(
        'Text directive value starting with @ must be an @embed, @run, or @call directive',
        'text',
        {
          location: convertLocation(node.location?.start),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }

    // For @call, validate format without regex
    if (directive.value.startsWith('@call')) {
      // Extract parts without using regex
      const valueAfterCall = directive.value.substring('@call'.length).trim();
      
      // Find the first space to separate api.method from path
      const firstSpaceIndex = valueAfterCall.indexOf(' ');
      if (firstSpaceIndex === -1) {
        throw new MeldDirectiveError(
          'Invalid @call format in text directive. Must be "@call api.method [path]"',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
      
      // Extract api.method part
      const apiMethodPart = valueAfterCall.substring(0, firstSpaceIndex);
      const hasDot = apiMethodPart.includes('.');
      
      // Extract api and method parts
      const apiMethodParts = hasDot ? apiMethodPart.split('.') : [];
      const hasValidApiMethod = apiMethodParts.length === 2 && 
                               isValidIdentifier(apiMethodParts[0]) && 
                               isValidIdentifier(apiMethodParts[1]);
      
      // Extract path part
      const pathPart = valueAfterCall.substring(firstSpaceIndex + 1).trim();
      const hasValidPath = pathPart.startsWith('[') && pathPart.endsWith(']');
      
      if (!(hasDot && hasValidApiMethod && hasValidPath)) {
        throw new MeldDirectiveError(
          'Invalid @call format in text directive. Must be "@call api.method [path]"',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
    }
    // For @embed directive, basic validation
    else if (directive.value.startsWith('@embed')) {
      // Extract the part after @embed and check it has a path in [] brackets
      const valueAfterEmbed = directive.value.substring('@embed'.length).trim();
      
      // >>> Refined Check: Ensure content is wrapped in [...] <<<
      if (!(valueAfterEmbed.startsWith('[') && valueAfterEmbed.endsWith(']'))) {
        throw new MeldDirectiveError(
          'Invalid @embed format in text directive. Must be "@embed [path]"',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
      
      // No need to validate the content inside the brackets in detail here
      // The EmbedDirectiveHandler will do that when processing
    }
    // For @run directive, basic validation
    else if (directive.value.startsWith('@run')) {
      // Extract the part after @run and check it has a command in [] brackets
      const valueAfterRun = directive.value.substring('@run'.length).trim();
      
      // >>> Refined Check: Ensure content is wrapped in [...] <<<
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
      
      // No need to validate the content inside the brackets in detail here
      // The RunDirectiveHandler will do that when processing
    }
  } else {
    // It's a literal string value
    // Check for mismatched quotes
    const firstQuote = directive.value[0];
    const lastQuote = directive.value[directive.value.length - 1];
    
    // Allow both single and double quotes, but they must match
    if (firstQuote !== lastQuote || !['\'', '"', '`'].includes(firstQuote)) {
      // Instead of regex, manually check for unescaped quotes
      let unescapedQuoteCount = 0;
      for (let i = 0; i < directive.value.length; i++) {
        const char = directive.value[i];
        if ((char === '\'' || char === '"' || char === '`') && 
            (i === 0 || directive.value[i-1] !== '\\')) {
          unescapedQuoteCount++;
        }
      }
      
      if (unescapedQuoteCount > 2) {
        throw new MeldDirectiveError(
          'Text directive string value contains unescaped quotes',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
    }

    // Check for multiline strings in non-template literals
    if (firstQuote !== '`' && directive.value.includes('\n')) {
      throw new MeldDirectiveError(
        'Multiline strings are only allowed in template literals (backtick quotes)',
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

/**
 * Helper function to validate identifier format without regex
 */
function isValidIdentifier(str: string): boolean {
  if (!str || str.length === 0) return false;
  
  // First character must be letter or underscore
  const firstChar = str.charAt(0);
  if (!(firstChar === '_' || (firstChar >= 'a' && firstChar <= 'z') || (firstChar >= 'A' && firstChar <= 'Z'))) {
    return false;
  }
  
  // Rest of characters must be letters, numbers, or underscore
  for (let i = 1; i < str.length; i++) {
    const char = str.charAt(i);
    if (!((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || 
          (char >= '0' && char <= '9') || char === '_')) {
      return false;
    }
  }
  
  return true;
} 