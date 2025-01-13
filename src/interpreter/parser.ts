import type { DirectiveNode, Location, MeldNode, TextNode, DirectiveKind } from 'meld-spec';
import { ErrorFactory } from './errors/factory';

interface Token {
  type: 'text' | 'directive';
  content: string;
  location: Location;
}

function tokenize(content: string): Token[] {
  const lines = content.split('\n');
  const tokens: Token[] = [];
  let currentToken: Token | null = null;
  let inMultilineContent = false;
  let multilineStart: { line: number; column: number } | null = null;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const trimmedLine = line.trim();

    // Handle multi-line content
    if (inMultilineContent) {
      if (trimmedLine.endsWith('"""')) {
        currentToken!.content += '\n' + line.slice(0, line.lastIndexOf('"""'));
        currentToken!.location.end = {
          line: lineNum + 1,
          column: line.lastIndexOf('"""') + 4
        };
        tokens.push(currentToken!);
        currentToken = null;
        inMultilineContent = false;
        continue;
      }
      currentToken!.content += '\n' + line;
      continue;
    }

    // Start of directive
    if (trimmedLine.startsWith('@')) {
      if (currentToken?.type === 'text') {
        tokens.push(currentToken);
      }

      const startColumn = line.indexOf('@') + 1;
      currentToken = {
        type: 'directive',
        content: trimmedLine,
        location: {
          start: { line: lineNum + 1, column: startColumn },
          end: { line: lineNum + 1, column: line.length + 1 }
        }
      };

      // Check for multi-line content
      if (trimmedLine.includes('content="""')) {
        if (!trimmedLine.endsWith('"""')) {
          inMultilineContent = true;
          multilineStart = { line: lineNum + 1, column: startColumn };
          continue;
        }
      } else {
        tokens.push(currentToken);
        currentToken = null;
      }
    } else if (!inMultilineContent) {
      // Handle regular text content
      if (!currentToken || currentToken.type === 'directive') {
        currentToken = {
          type: 'text',
          content: line,
          location: {
            start: { line: lineNum + 1, column: 1 },
            end: { line: lineNum + 1, column: line.length + 1 }
          }
        };
      } else {
        currentToken.content += '\n' + line;
        currentToken.location.end = {
          line: lineNum + 1,
          column: line.length + 1
        };
      }
    }
  }

  // Add final token if exists
  if (currentToken && !inMultilineContent) {
    tokens.push(currentToken);
  }

  // Handle unclosed multi-line content
  if (inMultilineContent && multilineStart) {
    throw ErrorFactory.createParseError(
      'Unclosed multi-line content block',
      multilineStart
    );
  }

  return tokens;
}

function parseDirective(content: string, location: Location): DirectiveNode {
  const match = content.match(/@(\w+)(?:\s+([^]*))?\s*$/);
  if (!match) {
    throw ErrorFactory.createParseError('Invalid directive syntax', location.start);
  }

  const [, kind, rawArgs = ''] = match;
  const validKinds: DirectiveKind[] = ['text', 'data', 'run', 'define', 'path', 'embed', 'import'];
  if (!validKinds.includes(kind as DirectiveKind)) {
    throw ErrorFactory.createParseError(`Invalid directive kind: ${kind}`, location.start);
  }

  const data: Record<string, any> = {};
  let args = rawArgs;

  // Handle multi-line content for embed directives first
  if (kind === 'embed') {
    const contentMatch = args.match(/content="""([\s\S]*?)"""/);
    if (contentMatch) {
      data.content = contentMatch[1].trim();
      // Remove the content part from args to not interfere with other parsing
      args = args.replace(/content="""[\s\S]*?"""/, '');
    }
  }

  // Parse all key-value pairs
  let currentPos = 0;
  while (currentPos < args.length) {
    // Find next key=value pair
    const keyMatch = args.slice(currentPos).match(/(\w+)=/);
    if (!keyMatch) break;

    const key = keyMatch[1];
    currentPos += keyMatch.index! + keyMatch[0].length;

    // Determine the type of value
    const char = args[currentPos];
    let value: any;
    let valueEnd: number;

    if (char === '"') {
      // String value
      const stringMatch = args.slice(currentPos).match(/"([^"]*)"/)!;
      value = stringMatch[1];
      valueEnd = currentPos + stringMatch[0].length;
    } else if (char === '{' || char === '[') {
      // Object or Array - find matching closing bracket
      let depth = 1;
      let i = currentPos + 1;
      const closingChar = char === '{' ? '}' : ']';
      
      while (depth > 0 && i < args.length) {
        if (args[i] === char) depth++;
        if (args[i] === closingChar) depth--;
        i++;
      }

      if (depth > 0) {
        throw ErrorFactory.createParseError(
          `Unclosed ${char === '{' ? 'object' : 'array'} in value for ${key}`,
          location.start
        );
      }

      try {
        value = JSON.parse(args.slice(currentPos, i));
        valueEnd = i;
      } catch (error) {
        throw ErrorFactory.createParseError(
          `Invalid JSON value for ${key}: ${error instanceof Error ? error.message : String(error)}`,
          location.start
        );
      }
    } else {
      // Other values (number, boolean, null)
      const valueMatch = args.slice(currentPos).match(/([^\s,}]+)/);
      if (!valueMatch) {
        throw ErrorFactory.createParseError(
          `Missing value for ${key}`,
          location.start
        );
      }

      const rawValue = valueMatch[1];
      try {
        // Try parsing as JSON to handle numbers, booleans, and null
        value = JSON.parse(rawValue);
      } catch {
        // If not valid JSON, treat as string
        value = rawValue;
      }
      valueEnd = currentPos + valueMatch[0].length;
    }

    data[key] = value;
    currentPos = valueEnd;
  }

  return {
    type: 'Directive',
    directive: {
      kind: kind as DirectiveKind,
      ...data
    },
    location
  };
}

/**
 * Parse Meld content into an AST
 * @param content The Meld content to parse
 * @returns Array of AST nodes
 * @throws {MeldParseError} If parsing fails
 */
export function parseMeld(content: string): MeldNode[] {
  try {
    const tokens = tokenize(content);
    return tokens.map(token => {
      if (token.type === 'directive') {
        return parseDirective(token.content, token.location);
      } else {
        return {
          type: 'Text',
          content: token.content,
          location: token.location
        } as TextNode;
      }
    });
  } catch (error) {
    throw ErrorFactory.createParseError(error instanceof Error ? error.message : 'Parse error');
  }
} 