import type { DirectiveNode, Location, MeldNode, TextNode, DirectiveKind } from 'meld-spec';
import { ErrorFactory } from './errors/factory';
import { interpreterLogger } from '../utils/logger';

interface Token {
  type: 'text' | 'directive';
  content: string;
  location: Location;
}

function tokenize(content: string): Token[] {
  interpreterLogger.debug('Starting tokenization', {
    contentLength: content.length
  });

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
        interpreterLogger.debug('Completed multiline token', {
          type: currentToken!.type,
          location: currentToken!.location
        });
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
      interpreterLogger.debug('Found directive token', {
        content: trimmedLine,
        location: currentToken.location
      });
      tokens.push(currentToken);
      currentToken = null;
    }
    // Start of multi-line content
    else if (trimmedLine.startsWith('"""')) {
      if (currentToken?.type === 'text') {
        tokens.push(currentToken);
      }

      const startColumn = line.indexOf('"""') + 1;
      multilineStart = { line: lineNum + 1, column: startColumn };
      currentToken = {
        type: 'text',
        content: line.slice(line.indexOf('"""') + 3),
        location: {
          start: { line: lineNum + 1, column: startColumn },
          end: { line: lineNum + 1, column: line.length + 1 }
        }
      };
      inMultilineContent = true;
      interpreterLogger.debug('Starting multiline content', {
        location: { line: lineNum + 1, column: startColumn }
      });
    }
    // Regular text content
    else {
      if (!currentToken) {
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

  if (currentToken) {
    tokens.push(currentToken);
  }

  interpreterLogger.debug('Tokenization completed', {
    tokenCount: tokens.length
  });

  return tokens;
}

function parseDirective(content: string, location: Location): DirectiveNode {
  interpreterLogger.debug('Parsing directive', {
    content,
    location
  });

  try {
    // Remove @ prefix
    const directiveContent = content.startsWith('@') ? content.slice(1) : content;

    // Split into kind and arguments
    const [kind, ...args] = directiveContent.split(/\s+/);
    const argsStr = args.join(' ');

    // Parse arguments as JSON if present
    let directive: any = { kind };
    if (argsStr) {
      try {
        const argsObj = JSON.parse(argsStr);
        directive = { ...directive, ...argsObj };
      } catch (error) {
        interpreterLogger.error('Failed to parse directive arguments', {
          content: argsStr,
          error: error instanceof Error ? error.message : String(error),
          location
        });
        throw ErrorFactory.createParseError(
          `Invalid directive arguments: ${error instanceof Error ? error.message : String(error)}`,
          location.start
        );
      }
    }

    interpreterLogger.debug('Successfully parsed directive', {
      kind,
      location
    });

    return {
      type: 'Directive',
      directive,
      location
    };
  } catch (error) {
    interpreterLogger.error('Failed to parse directive', {
      content,
      error: error instanceof Error ? error.message : String(error),
      location
    });
    throw error;
  }
}

export function parseMeld(content: string): MeldNode[] {
  interpreterLogger.info('Starting Meld content parsing', {
    contentLength: content.length
  });

  try {
    const tokens = tokenize(content);
    const nodes: MeldNode[] = [];

    for (const token of tokens) {
      if (token.type === 'directive') {
        nodes.push(parseDirective(token.content, token.location));
      } else {
        nodes.push({
          type: 'Text',
          content: token.content,
          location: token.location
        });
      }
    }

    interpreterLogger.info('Meld parsing completed', {
      nodeCount: nodes.length,
      nodeTypes: nodes.map(n => n.type)
    });

    return nodes;
  } catch (error) {
    interpreterLogger.error('Failed to parse Meld content', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
} 