import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { TextExtractor } from '@services/lsp/utils/TextExtractor';
import { CommentTokenHelper } from '@services/lsp/utils/CommentTokenHelper';
import { EffectTokenHelper } from '@services/lsp/utils/EffectTokenHelper';

export class FileReferenceVisitor extends BaseVisitor {
  private mainVisitor: any;
  private commentHelper: CommentTokenHelper;
  
  constructor(document: any, tokenBuilder: any) {
    super(document, tokenBuilder);
    this.commentHelper = new CommentTokenHelper(document, tokenBuilder);
  }
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'FileReference' || 
           node.type === 'load-content' ||
           node.type === 'Comment' ||
           node.type === 'Parameter' ||
           node.type === 'Frontmatter' ||
           node.type === 'CodeFence' ||
           node.type === 'MlldRunBlock';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    switch (node.type) {
      case 'FileReference':
        this.visitFileReference(node, context);
        break;
      case 'load-content':
        this.visitLoadContent(node, context);
        break;
      case 'Comment':
        this.visitComment(node);
        break;
      case 'Parameter':
        this.visitParameter(node);
        break;
      case 'Frontmatter':
        this.visitFrontmatter(node, context);
        break;
      case 'CodeFence':
      case 'MlldRunBlock':
        this.visitCodeFence(node);
        break;
    }
  }
  
  private visitFileReference(node: any, context: VisitorContext): void {
    const text = TextExtractor.extract([node]);
    
    // Check if this is a placeholder FileReference (<>)
    if (node.source?.type === 'placeholder') {
      // For placeholders, tokenize the entire <> as a single variable token
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: 2, // "<>"
        tokenType: 'variable',
        modifiers: []
      });
      
      // Handle field access if present (e.g., <>.fm.title)
      if (node.fields && node.fields.length > 0) {
        const sourceText = this.document.getText();
        let currentPos = 2; // Start after <>
        
        for (const field of node.fields) {
          // Token for "."
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: node.location.start.column - 1 + currentPos,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
          
          // Token for field name
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: node.location.start.column - 1 + currentPos + 1,
            length: field.value.length,
            tokenType: 'property',
            modifiers: []
          });
          
          currentPos += 1 + field.value.length; // Move past . and field name
        }
      }
      
      return;
    }
    
    // Always tokenize as: <, filename, > (and possibly # section)
    const nodeStartChar = node.location.start.column - 1;
    const sourceText = this.document.getText();
    const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    
    // Token for "<"
    this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: nodeStartChar,
        length: 1,
        tokenType: 'alligatorOpen',
        modifiers: []
      });
      
      // Calculate the end of the file reference part (before field access or pipes)
      let fileRefEndOffset = node.location.end.offset;
      if (node.fields && node.fields.length > 0) {
        // Find where the first dot appears for field access
        const firstDotIndex = nodeText.lastIndexOf('>');
        if (firstDotIndex !== -1) {
          fileRefEndOffset = node.location.start.offset + firstDotIndex + 1;
        }
      } else if (node.pipes && node.pipes.length > 0) {
        // Find where the first pipe appears
        const firstPipeIndex = nodeText.indexOf('|');
        if (firstPipeIndex !== -1) {
          fileRefEndOffset = node.location.start.offset + firstPipeIndex;
        }
      }
      
      if (!node.section) {
        // No section - check if we have segments (variables/paths) or simple filename
        if (node.source?.segments && Array.isArray(node.source.segments)) {
          // Path with variables like <@base/file.md>
          // Tokenize each segment individually
          for (const segment of node.source.segments) {
            if (segment.type === 'VariableReference' && segment.valueType === 'varIdentifier' && segment.location) {
              // Variable like @base - highlight as variable (light blue)
              this.tokenBuilder.addToken({
                line: segment.location.start.line - 1,
                char: segment.location.start.column - 1,
                length: segment.identifier.length + 1, // +1 for @
                tokenType: 'variable',
                modifiers: []
              });
            } else if (segment.type === 'Text' && segment.location && segment.content) {
              // Text content like "file.md" - highlight as alligator (light teal)
              this.tokenBuilder.addToken({
                line: segment.location.start.line - 1,
                char: segment.location.start.column - 1,
                length: segment.content.length,
                tokenType: 'alligator',
                modifiers: []
              });
            } else if (segment.type === 'PathSeparator' && segment.location) {
              // Path separator "/" - highlight as operator
              this.tokenBuilder.addToken({
                line: segment.location.start.line - 1,
                char: segment.location.start.column - 1,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }
        } else {
          // Simple filename without variables
          const filenameEnd = fileRefEndOffset - node.location.start.offset - 1; // -1 for >
          const filenameLength = filenameEnd - 1; // -1 for <
          if (filenameLength > 0) {
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + 1,
              length: filenameLength,
              tokenType: 'alligator',
              modifiers: []
            });
          }
        }

        // Token for ">"
        const filenameEnd = fileRefEndOffset - node.location.start.offset - 1; // -1 for >
        const closePos = nodeStartChar + filenameEnd;
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: closePos,
          length: 1,
          tokenType: 'alligatorClose',
          modifiers: []
        });
      } else {
        // Has section - need to handle # and section name
        const hashIndex = text.indexOf('#');

        // Token for filename (between < and #)
        // Check if we have segments (variables/paths) or simple filename
        if (node.source?.segments && Array.isArray(node.source.segments)) {
          // Path with variables like <@base/file.md#section>
          // Tokenize each segment individually
          for (const segment of node.source.segments) {
            if (segment.type === 'VariableReference' && segment.valueType === 'varIdentifier' && segment.location) {
              // Variable like @base - highlight as variable (light blue)
              this.tokenBuilder.addToken({
                line: segment.location.start.line - 1,
                char: segment.location.start.column - 1,
                length: segment.identifier.length + 1, // +1 for @
                tokenType: 'variable',
                modifiers: []
              });
            } else if (segment.type === 'Text' && segment.location && segment.content) {
              // Text content like "file.md" - highlight as alligator (light teal)
              this.tokenBuilder.addToken({
                line: segment.location.start.line - 1,
                char: segment.location.start.column - 1,
                length: segment.content.length,
                tokenType: 'alligator',
                modifiers: []
              });
            } else if (segment.type === 'PathSeparator' && segment.location) {
              // Path separator "/" - highlight as operator
              this.tokenBuilder.addToken({
                line: segment.location.start.line - 1,
                char: segment.location.start.column - 1,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }
        } else {
          // Simple filename without variables
          if (hashIndex > 1) {
            const filenameLength = hashIndex - 1; // From after < to before #
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + 1,
              length: filenameLength,
              tokenType: 'typeParameter',  // Use typeParameter for filenames with sections
              modifiers: []
            });
          }
        }
        
        // Token for "#"
        if (hashIndex !== -1) {
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: nodeStartChar + hashIndex,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }
        
        // Token for section
        if (node.sectionLocation) {
          this.tokenBuilder.addToken({
            line: node.sectionLocation.start.line - 1,
            char: node.sectionLocation.start.column - 1,
            length: node.section.length,
            tokenType: 'section',
            modifiers: []
          });
        }
        
        // Token for ">"
        const closePos = nodeText.lastIndexOf('>');
        if (closePos !== -1) {
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: nodeStartChar + closePos,
            length: 1,
            tokenType: 'alligatorClose',
            modifiers: []
          });
        }
      }
      
      // Handle field access
      if (node.fields && node.fields.length > 0) {
        let currentPos = fileRefEndOffset - node.location.start.offset;
        for (const field of node.fields) {
          // Find the dot position
          const dotPos = sourceText.indexOf('.', node.location.start.offset + currentPos);
          if (dotPos !== -1) {
            const dotChar = dotPos - node.location.start.offset;
            // Token for "."
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + dotChar,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
            
            // Token for field name
            const fieldLength = field.value.length;
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + dotChar + 1,
              length: fieldLength,
              tokenType: 'property',
              modifiers: []
            });
            
            currentPos = dotChar + 1 + fieldLength;
          }
        }
      }
      
      // Handle pipes
      if (node.pipes && node.pipes.length > 0) {
        let currentPos = nodeText.indexOf('|');
        for (const pipe of node.pipes) {
          if (currentPos !== -1) {
            // Token for '|' or '||' (parallel group)
            const isParallel = nodeText[currentPos + 1] === '|';
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + currentPos,
              length: isParallel ? 2 : 1,
              tokenType: 'operator',
              modifiers: []
            });
            
            // Token for "@" + pipe name as function (pipeline transforms are function invocations)
            const atSymbolPos = nodeText.indexOf('@', currentPos + (nodeText[currentPos + 1] === '|' ? 2 : 1));
            if (atSymbolPos !== -1) {
              const pipeTransform = pipe.transform || pipe.name; // Support both properties
              if (pipeTransform) {
                const pipeName = '@' + pipeTransform;
                this.tokenBuilder.addToken({
                  line: node.location.start.line - 1,
                  char: nodeStartChar + atSymbolPos,
                  length: pipeName.length,
                  tokenType: 'function',
                  modifiers: []
                });
                
                // Check for arguments
                if (pipe.args && pipe.args.length > 0) {
                  const openParenPos = nodeText.indexOf('(', atSymbolPos + pipeName.length);
                  const closeParenPos = nodeText.indexOf(')', openParenPos);
                  
                  if (openParenPos !== -1 && closeParenPos !== -1) {
                    // Token for "("
                    this.tokenBuilder.addToken({
                      line: node.location.start.line - 1,
                      char: nodeStartChar + openParenPos,
                      length: 1,
                      tokenType: 'operator',
                      modifiers: []
                    });
                    
                    // Token for argument content
                    const argContent = nodeText.substring(openParenPos + 1, closeParenPos);
                    if (argContent.length > 0) {
                      this.tokenBuilder.addToken({
                        line: node.location.start.line - 1,
                        char: nodeStartChar + openParenPos + 1,
                        length: argContent.length,
                        tokenType: 'string',
                        modifiers: []
                      });
                    }
                    
                    // Token for ")"
                    this.tokenBuilder.addToken({
                      line: node.location.start.line - 1,
                      char: nodeStartChar + closeParenPos,
                      length: 1,
                      tokenType: 'operator',
                      modifiers: []
                    });
                    
                    // Find next pipe after the closing paren
                    currentPos = nodeText.indexOf('|', closeParenPos);
                  } else {
                    // Find next pipe
                    currentPos = nodeText.indexOf('|', currentPos + 1 + pipeTransform.length);
                  }
                } else {
                  // Find next pipe
                  currentPos = nodeText.indexOf('|', currentPos + 1 + pipeTransform.length);
                }
              } else {
                // No transform name, just move past this pipe
                currentPos = nodeText.indexOf('|', currentPos + 1);
              }
            } else {
              // No @ symbol found, move to next pipe
              currentPos = nodeText.indexOf('|', currentPos + 1);
            }
          }
        }
      }
    }
  
  private visitLoadContent(node: any, context: VisitorContext): void {
    const sourceText = this.document.getText();
    const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    const nodeStartChar = node.location.start.column - 1;

    // Check for AST selectors { } and tokenize them
    if (node.ast && Array.isArray(node.ast) && node.ast.length > 0) {
      this.tokenizeAstSelectors(nodeText, node.location.start.offset, node.location.start.line - 1);
    }

    // Token for "<"
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: nodeStartChar,
      length: 1,
      tokenType: 'alligatorOpen',
      modifiers: []
    });
    
    // Determine where the file content ends (before pipes if present)
    let contentEndOffset = node.location.end.offset;
    let pipeStartOffset = -1;
    
    if (node.pipes && node.pipes.length > 0) {
      // Find the first pipe in the text
      const firstPipeIndex = nodeText.indexOf('|');
      if (firstPipeIndex !== -1) {
        pipeStartOffset = node.location.start.offset + firstPipeIndex;
        contentEndOffset = pipeStartOffset;
      }
    }
    
    if (!node.options?.section?.identifier) {
      // No section - check if we have segments (variables/paths) or simple filename

      // Calculate close index
      let closeIndex;
      if (node.pipes && node.pipes.length > 0) {
        const pipeIndex = nodeText.indexOf('|');
        closeIndex = pipeIndex !== -1 ? pipeIndex - 1 : nodeText.lastIndexOf('>');
      } else {
        closeIndex = nodeText.lastIndexOf('>');
      }

      if (node.source?.segments && Array.isArray(node.source.segments)) {
        // Path with variables like <@base/file.md>
        // Tokenize each segment individually
        for (const segment of node.source.segments) {
          if (segment.type === 'VariableReference' && segment.valueType === 'varIdentifier' && segment.location) {
            // Variable like @base - highlight as variable (light blue)
            this.tokenBuilder.addToken({
              line: segment.location.start.line - 1,
              char: segment.location.start.column - 1,
              length: segment.identifier.length + 1, // +1 for @
              tokenType: 'variable',
              modifiers: []
            });
          } else if (segment.type === 'Text' && segment.location && segment.content) {
            // Text content like "file.md" - highlight as alligator (light teal)
            this.tokenBuilder.addToken({
              line: segment.location.start.line - 1,
              char: segment.location.start.column - 1,
              length: segment.content.length,
              tokenType: 'alligator',
              modifiers: []
            });
          } else if (segment.type === 'PathSeparator' && segment.location) {
            // Path separator "/" - highlight as operator
            this.tokenBuilder.addToken({
              line: segment.location.start.line - 1,
              char: segment.location.start.column - 1,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      } else {
        // Simple filename without variables
        const filenameLength = closeIndex - 1; // -1 for the initial <
        if (filenameLength > 0) {
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: nodeStartChar + 1,
            length: filenameLength,
            tokenType: 'alligator',
            modifiers: []
          });
        }
      }

      // Token for ">"
      const closePos = nodeStartChar + closeIndex;
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: closePos,
        length: 1,
        tokenType: 'alligatorClose',
        modifiers: []
      });
    } else {
      // Has section - tokenize as: <, filename, #, section, >, [pipes]
      
      // Find the # position to know where filename ends
      const hashIndex = nodeText.indexOf('#');
      if (hashIndex === -1) return; // Shouldn't happen

      // Token for filename (from after < to before space before #)
      // Check if we have segments (variables/paths) or simple filename
      if (node.source?.segments && Array.isArray(node.source.segments)) {
        // Path with variables like <@base/file.md#section>
        // Tokenize each segment individually
        for (const segment of node.source.segments) {
          if (segment.type === 'VariableReference' && segment.valueType === 'varIdentifier' && segment.location) {
            // Variable like @base - highlight as variable (light blue)
            this.tokenBuilder.addToken({
              line: segment.location.start.line - 1,
              char: segment.location.start.column - 1,
              length: segment.identifier.length + 1, // +1 for @
              tokenType: 'variable',
              modifiers: []
            });
          } else if (segment.type === 'Text' && segment.location && segment.content) {
            // Text content like "file.md" - highlight as alligator (light teal)
            this.tokenBuilder.addToken({
              line: segment.location.start.line - 1,
              char: segment.location.start.column - 1,
              length: segment.content.length,
              tokenType: 'alligator',
              modifiers: []
            });
          } else if (segment.type === 'PathSeparator' && segment.location) {
            // Path separator "/" - highlight as operator
            this.tokenBuilder.addToken({
              line: segment.location.start.line - 1,
              char: segment.location.start.column - 1,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      } else {
        // Simple filename without variables
        const spaceBeforeHash = nodeText.lastIndexOf(' ', hashIndex - 1);
        const filenameEnd = spaceBeforeHash > 0 ? spaceBeforeHash : hashIndex;
        const filenameLength = filenameEnd - 1; // -1 for the initial <

        if (filenameLength > 0) {
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: nodeStartChar + 1, // After <
            length: filenameLength,
            tokenType: 'alligator',
            modifiers: []
          });
        }
      }
      
      // Token for "#"
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: nodeStartChar + hashIndex,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
      
      // Token for section
      const sectionNode = node.options.section.identifier;
      if (sectionNode.location) {
        this.tokenBuilder.addToken({
          line: sectionNode.location.start.line - 1,
          char: sectionNode.location.start.column - 1,
          length: sectionNode.location.end.column - sectionNode.location.start.column,
          tokenType: 'section',
          modifiers: []
        });
      }
      
      // Token for ">"
      let closeIndexForSection;
      if (node.pipes && node.pipes.length > 0) {
        const pipeIndex = nodeText.indexOf('|');
        // Find the > before the pipe
        const beforePipe = nodeText.substring(0, pipeIndex);
        closeIndexForSection = beforePipe.lastIndexOf('>');
      } else {
        closeIndexForSection = nodeText.lastIndexOf('>');
      }
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: nodeStartChar + closeIndexForSection,
        length: 1,
        tokenType: 'alligatorClose',
        modifiers: []
      });
    }
    
    // Handle pipes if present
    if (node.pipes && node.pipes.length > 0) {
      // Check if we can use pipe locations
      const hasPipeLocations = node.pipes[0]?.location?.start?.offset !== undefined;
      
      if (!hasPipeLocations) {
        // Fallback to text-based parsing
        let currentPos = nodeText.indexOf('|');
        for (const pipe of node.pipes) {
          if (currentPos !== -1) {
            // Token for '|' or '||' (parallel group)
            const isParallel = nodeText[currentPos + 1] === '|';
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + currentPos,
              length: isParallel ? 2 : 1,
              tokenType: 'operator',
              modifiers: []
            });
            
            // Token for pipe content: either @transform or inline effects (show, log, output)
            const afterPipe = currentPos + (isParallel ? 2 : 1);
            // Skip whitespace
            let contentStart = afterPipe;
            while (contentStart < nodeText.length && /\s/.test(nodeText[contentStart])) contentStart++;

            const effectName = (pipe.transform || pipe.name || '').toString();
            const isEffect = !/^@/.test(nodeText[contentStart]) && /^(show|log|output)\b/.test(effectName);

            if (isEffect) {
              // Add keyword for effect name
              this.tokenBuilder.addToken({
                line: node.location.start.line - 1,
                char: nodeStartChar + contentStart,
                length: effectName.length,
                tokenType: 'keyword',
                modifiers: []
              });

              // Heuristic tokenization for common effect arguments
              const segmentEnd = nodeText.indexOf('|', contentStart) === -1 ? nodeText.length : nodeText.indexOf('|', contentStart);
              const rest = nodeText.slice(contentStart + effectName.length, segmentEnd);

              if (effectName === 'output') {
                // Optional source var after 'output'
                const varMatch = rest.match(/\s+(@[A-Za-z_][A-Za-z0-9_]*)/);
                if (varMatch && varMatch.index !== undefined) {
                  const varChar = nodeStartChar + contentStart + effectName.length + varMatch.index + varMatch[0].indexOf('@');
                  this.tokenBuilder.addToken({
                    line: node.location.start.line - 1,
                    char: varChar,
                    length: varMatch[1].length,
                    tokenType: 'variable',
                    modifiers: []
                  });
                }
                const toMatch = rest.match(/\s+to\s+/);
                if (toMatch && toMatch.index !== undefined) {
                  const toChar = nodeStartChar + contentStart + effectName.length + toMatch.index + toMatch[0].indexOf('to');
                  this.tokenBuilder.addToken({
                    line: node.location.start.line - 1,
                    char: toChar,
                    length: 2,
                    tokenType: 'keyword',
                    modifiers: []
                  });
                  const targetStart = toMatch.index + toMatch[0].length;
                  const targetRest = rest.slice(targetStart);
                  const streamMatch = targetRest.match(/^(stdout|stderr)\b/);
                  if (streamMatch) {
                    const sChar = nodeStartChar + contentStart + effectName.length + targetStart;
                    this.tokenBuilder.addToken({
                      line: node.location.start.line - 1,
                      char: sChar,
                      length: streamMatch[1].length,
                      tokenType: 'keyword',
                      modifiers: []
                    });
                  } else {
                    const tVar = targetRest.match(/^(@[A-Za-z_][A-Za-z0-9_]*)/);
                    if (tVar) {
                      const tChar = nodeStartChar + contentStart + effectName.length + targetStart;
                      this.tokenBuilder.addToken({
                        line: node.location.start.line - 1,
                        char: tChar,
                        length: tVar[1].length,
                        tokenType: 'variable',
                        modifiers: []
                      });
                    } else if (/^"/.test(targetRest)) {
                      const m = targetRest.match(/^"([^"\\]|\\.)*"/);
                      if (m) {
                        const qChar = nodeStartChar + contentStart + effectName.length + targetStart;
                        this.tokenBuilder.addToken({
                          line: node.location.start.line - 1,
                          char: qChar,
                          length: m[0].length,
                          tokenType: 'string',
                          modifiers: []
                        });
                      }
                    }
                  }
                }
              } else {
                // show/log: optional @var or quoted/backtick string
                const simpleArg = rest.match(/\s+(@[A-Za-z_][A-Za-z0-9_]*|`[^`]*`|"([^"\\]|\\.)*"|\'([^'\\]|\\.)*\')/);
                if (simpleArg && simpleArg.index !== undefined) {
                  const argText = simpleArg[1] || simpleArg[0].trim();
                  const argChar = nodeStartChar + contentStart + effectName.length + simpleArg.index + simpleArg[0].indexOf(argText);
                  this.tokenBuilder.addToken({
                    line: node.location.start.line - 1,
                    char: argChar,
                    length: argText.length,
                    tokenType: argText.startsWith('@') ? 'variable' : 'string',
                    modifiers: []
                  });
                }
              }

              currentPos = nodeText.indexOf('|', contentStart);
            } else {
              // Standard @transform flow - use function token type (pipeline transforms)
              const atSymbolPos = nodeText.indexOf('@', afterPipe);
              if (atSymbolPos !== -1) {
                const pipeTransform = pipe.transform || pipe.name;
                if (pipeTransform) {
                  const pipeName = '@' + pipeTransform;
                  this.tokenBuilder.addToken({
                    line: node.location.start.line - 1,
                    char: nodeStartChar + atSymbolPos,
                    length: pipeName.length,
                    tokenType: 'function',
                    modifiers: []
                  });
                  currentPos = nodeText.indexOf('|', currentPos + 1 + pipeTransform.length);
                } else {
                  currentPos = nodeText.indexOf('|', currentPos + 1);
                }
            // Token for "@pipeName" - use function token type (pipeline transforms)
            const atSymbolPos = nodeText.indexOf('@', currentPos + (isParallel ? 2 : 1));
            if (atSymbolPos !== -1) {
              const pipeTransform = pipe.transform || pipe.name;
              if (pipeTransform) {
                const pipeName = '@' + pipeTransform;
                this.tokenBuilder.addToken({
                  line: node.location.start.line - 1,
                  char: nodeStartChar + atSymbolPos,
                  length: pipeName.length,
                  tokenType: 'function',
                  modifiers: []
                });
                currentPos = nodeText.indexOf('|', currentPos + 1 + pipeTransform.length);
              } else {
                currentPos = nodeText.indexOf('|', currentPos + 1);
              }
            }
          }
        }
        return;
      }
      
      // Use pipe locations when available
      for (const pipe of node.pipes) {
        if (!pipe.location?.start) {
          console.warn('[FileRef] Individual pipe missing location');
          continue;
        }
        
        // The pipe location includes the |@ prefix, so adjust accordingly
        const pipeStartOffset = pipe.location.start.offset;
        const pipeStartChar = pipe.location.start.column - 1;
        
        // Token for '|' or '||' (parallel group)
        // Detect parallel either when the next character is '|' (offset points at first '|')
        // or when the previous character is '|' (offset points at second '|').
        const sourceText = this.document.getText();
        const hasNextBar = sourceText[pipeStartOffset + 1] === '|';
        const hasPrevBar = sourceText[pipeStartOffset - 1] === '|';
        const isParallel = hasNextBar || hasPrevBar;

        const length = isParallel ? 2 : 1;
        const charStart = hasPrevBar ? (pipeStartChar - 1) : pipeStartChar;
        
        this.tokenBuilder.addToken({
          line: pipe.location.start.line - 1,
          char: charStart,
          length,
          tokenType: 'operator',
          modifiers: []
        });
        
        // Token for next stage: either @transform or inline effects (show, log, output)
        const pipeTransform = pipe.transform || pipe.name; // Support both properties
        // Start after the pipe(s), skipping whitespace
        let contentOffset = pipeStartOffset + (hasPrevBar ? 1 : (hasNextBar ? 2 : 1));
        while (/\s/.test(sourceText[contentOffset])) contentOffset++;
        const contentPos = this.document.positionAt(contentOffset);

        // contentOffset is an absolute offset; pass it to helper to emit tokens at correct positions
        const effectName = (pipeTransform || '').toString();
        const isEffect = sourceText[contentOffset] !== '@' && /^(show|log|output)\b/.test(effectName);
        if (isEffect) {
          const helper = new EffectTokenHelper(this.document, this.tokenBuilder);
          helper.tokenizeEffectKeyword(effectName, contentOffset);
          const endOfSegment = (() => {
            const idx = sourceText.indexOf('|', contentOffset);
            return idx === -1 ? sourceText.length : idx;
          })();
          const rest = sourceText.slice(contentOffset + effectName.length, endOfSegment);
          if (effectName === 'output') {
            helper.tokenizeOutputArgs(contentOffset + effectName.length, rest);
          } else {
            helper.tokenizeSimpleArg(contentOffset + effectName.length, rest);
          }
        } else {
          // Regular @transform token - use function token type (pipeline transforms)
          const atChar = contentPos.character; // content starts at '@'
          this.tokenBuilder.addToken({
            line: pipe.location.start.line - 1,
            char: atChar,
            length: pipeTransform.length + 1, // +1 for @
            tokenType: 'function',
            modifiers: []
          });
        }
        
        // Handle pipe arguments if present
        if (pipe.args && pipe.args.length > 0) {
          // Find the opening parenthesis position
          const argsStartOffset = pipeStartChar + 2 + (pipeTransform?.length || 0);
          
          // Token for "("
          this.tokenBuilder.addToken({
            line: pipe.location.start.line - 1,
            char: argsStartOffset,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
          
          // For now, tokenize all args as a single string token
          // This matches the test expectation for "80" as a string
          // Use the pipe's location to extract just the pipe text
          const pipeText = sourceText.substring(pipe.location.start.offset, pipe.location.end.offset);
          const localOpenParen = pipeText.indexOf('(');
          const localCloseParen = pipeText.indexOf(')');
          
          if (localOpenParen !== -1 && localCloseParen !== -1) {
            const argsText = pipeText.substring(localOpenParen + 1, localCloseParen);
            
            if (argsText.length > 0) {
              this.tokenBuilder.addToken({
                line: pipe.location.start.line - 1,
                char: argsStartOffset + 1,
                length: argsText.length,
                tokenType: 'string',
                modifiers: []
              });
            }
          }
          
          // Token for ")"
          if (localCloseParen !== -1) {
            this.tokenBuilder.addToken({
              line: pipe.location.start.line - 1,
              char: pipeStartChar + localCloseParen,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
    }
  }

  }

  }

  private visitComment(node: any): void {
    this.commentHelper.tokenizeStandaloneComment(node);
  }

  private visitParameter(node: any): void {
    // Parameter location includes @ symbol but name doesn't, so add 1
    const length = node.name ? (node.name.length + 1) : TextExtractor.extract([node]).length;
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length,
      tokenType: 'parameter',
      modifiers: []
    });
  }

  private visitFrontmatter(node: any, context: VisitorContext): void {
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: 3,
      tokenType: 'comment',
      modifiers: []
    });
    this.visitChildren(node, context, (child, mx) => this.mainVisitor.visitNode(child, mx));
    if (node.closeLocation) {
      this.tokenBuilder.addToken({
        line: node.closeLocation.start.line - 1,
        char: node.closeLocation.start.column - 1,
        length: 3,
        tokenType: 'comment',
        modifiers: []
      });
    }
  }

  private visitCodeFence(node: any): void {
    if (node.language && node.languageLocation) {
      this.tokenBuilder.addToken({
        line: node.languageLocation.start.line - 1,
        char: node.languageLocation.start.column - 1,
        length: node.language.length,
        tokenType: 'embedded',
        modifiers: []
      });
    }
    if (node.codeLocation && node.language) {
      this.tokenBuilder.addToken({
        line: node.codeLocation.start.line - 1,
        char: node.codeLocation.start.column - 1,
        length: node.code?.length || 0,
        tokenType: 'embeddedCode',
        modifiers: [],
        data: { language: node.language }
      });
    }
  }

  /**
   * Tokenizes AST selectors in file references: { selector }
   * Handles wildcards (*), type filters (*fn), name listing (??), and usage patterns
   */
  private tokenizeAstSelectors(nodeText: string, nodeStartOffset: number, line: number): void {
    // Find all { } blocks in the text
    const selectorRegex = /\{([^}]+)\}/g;
    let match;

    while ((match = selectorRegex.exec(nodeText)) !== null) {
      const fullMatch = match[0];
      const selectorContent = match[1].trim();
      const matchStart = match.index;

      // Token for opening brace
      const openBraceOffset = nodeStartOffset + matchStart;
      const openBracePos = this.document.positionAt(openBraceOffset);
      this.tokenBuilder.addToken({
        line: openBracePos.line,
        char: openBracePos.character,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });

      // Determine selector type and tokenize content
      const contentStart = matchStart + 1 + (match[0].indexOf(selectorContent) - 1);
      const contentOffset = nodeStartOffset + matchStart + nodeText.substring(matchStart).indexOf(selectorContent);
      const contentPos = this.document.positionAt(contentOffset);

      // Determine token type based on selector pattern
      let tokenType = 'variable'; // default
      const modifiers: string[] = [];

      if (selectorContent.includes('??')) {
        // Name listing: { ?? }, { fn?? }
        tokenType = 'keyword';
      } else if (selectorContent.startsWith('(') && selectorContent.endsWith(')')) {
        // Usage pattern: { (handleUser) }
        tokenType = 'function';
      } else if (selectorContent.includes('*')) {
        // Wildcard: { handle* }, { *Handler }, { *Validator* }
        tokenType = 'type';
      } else if (/^(fn|var|class|type|interface|method|property|const|let|function)$/.test(selectorContent) ||
                 /^\*(fn|var|class|type|interface|method|property|const|let|function)$/.test(selectorContent)) {
        // Type filter: { *fn }, { *class }
        tokenType = 'type';
        modifiers.push('declaration');
      }

      // Token for selector content
      this.tokenBuilder.addToken({
        line: contentPos.line,
        char: contentPos.character,
        length: selectorContent.length,
        tokenType,
        modifiers
      });

      // Token for closing brace
      const closeBraceOffset = nodeStartOffset + matchStart + fullMatch.length - 1;
      const closeBracePos = this.document.positionAt(closeBraceOffset);
      this.tokenBuilder.addToken({
        line: closeBracePos.line,
        char: closeBracePos.character,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
  }
}
