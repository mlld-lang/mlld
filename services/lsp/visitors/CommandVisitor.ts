import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';

export class CommandVisitor extends BaseVisitor {
  private mainVisitor: any;
  private operatorHelper: OperatorTokenHelper;
  
  constructor(document: any, tokenBuilder: any) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
  }
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'CommandBase' ||
           node.type === 'command' ||
           node.type === 'code' ||
           node.type === 'ExecInvocation' ||
           node.type === 'CommandReference';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (process.env.DEBUG_LSP === 'true' && node.type === 'ExecInvocation') {
      console.log('[EXEC-NODE]', {
        type: node.type,
        location: node.location,
        locationType: typeof node.location,
        isNone: node.location === 'none',
        commandRef: !!node.commandRef
      });
    }
    
    if (!node.location || node.location === 'none') {
      // For ExecInvocation with location 'none', try to process it anyway
      if (node.type === 'ExecInvocation' && node.commandRef) {
        this.visitExecInvocation(node, context);
        return;
      }
      // For command nodes with location 'none', try to tokenize anyway
      // (nested run cmd/js blocks often lack locations)
      if (node.type === 'command') {
        this.visitCommand(node, context);
        return;
      }
      // For code nodes with location 'none', try to tokenize anyway
      if (node.type === 'code') {
        this.visitCodeNode(node, context);
        return;
      }
      return;
    }
    
    switch (node.type) {
      case 'ExecInvocation':
        this.visitExecInvocation(node, context);
        break;
      case 'CommandReference':
        this.visitCommandReference(node, context);
        break;
      case 'code':
        this.visitCodeNode(node, context);
        break;
      default:
        this.visitCommand(node, context);
    }
  }
  
  private visitCommand(node: any, context: VisitorContext): void {
    // Handle command nodes without location (common in nested contexts)
    let effectiveLocation = node.location;
    if (!effectiveLocation || effectiveLocation === 'none') {
      // Try to reconstruct location from first child node
      const firstChild = node.command?.[0] || node.commandBases?.[0];
      if (firstChild?.location) {
        // Search backward from first child to find 'run' keyword
        const sourceText = this.document.getText();
        const searchStart = Math.max(0, firstChild.location.start.offset - 30);
        const searchEnd = firstChild.location.start.offset;
        const searchText = sourceText.substring(searchStart, searchEnd);
        const runIndex = searchText.lastIndexOf('run');

        if (process.env.DEBUG_LSP === 'true') {
          console.log('[COMMAND-LOC]', {
            hasRunKeyword: node.hasRunKeyword,
            firstChild: firstChild.location,
            searchText,
            runIndex
          });
        }

        if (runIndex !== -1 && node.hasRunKeyword) {
          // Find the end of the command block (closing brace or last child)
          const lastChild = node.command?.[node.command.length - 1];
          const endOffset = lastChild?.location?.end?.offset || firstChild.location.end.offset;
          // Search forward for closing brace
          const afterLast = sourceText.substring(endOffset, endOffset + 20);
          const closeBraceIndex = afterLast.indexOf('}');
          const finalEnd = closeBraceIndex !== -1 ? endOffset + closeBraceIndex + 1 : endOffset;

          effectiveLocation = {
            start: { offset: searchStart + runIndex, line: 0, column: 0 },
            end: { offset: finalEnd, line: 0, column: 0 }
          };
        } else {
          effectiveLocation = firstChild.location;
        }
      }
    }

    // Tokenize 'run' keyword if present (for nested run cmd/js blocks)
    if (node.hasRunKeyword && effectiveLocation) {
      const sourceText = this.document.getText();
      const nodeText = sourceText.substring(effectiveLocation.start.offset, effectiveLocation.end.offset);
      const runMatch = nodeText.match(/^\s*run\b/);

      if (process.env.DEBUG_LSP === 'true') {
        console.log('[RUN-TOKENIZE]', {
          hasRunKeyword: node.hasRunKeyword,
          effectiveLocation,
          nodeText,
          runMatch: !!runMatch
        });
      }

      if (runMatch) {
        const runOffset = effectiveLocation.start.offset + runMatch.index! + runMatch[0].indexOf('run');
        const runPos = this.document.positionAt(runOffset);
        this.tokenBuilder.addToken({
          line: runPos.line,
          char: runPos.character,
          length: 3,
          tokenType: 'directiveAction', // Same as top-level run directives
          modifiers: []
        });

        // Tokenize 'cmd' or language identifier if it follows 'run'
        const afterRun = nodeText.substring(runMatch.index! + runMatch[0].length);
        const cmdMatch = afterRun.match(/^\s*cmd\b/);
        const langMatch = afterRun.match(/^\s*(js|node|py|sh)\b/);

        if (cmdMatch) {
          const cmdOffset = runOffset + 3 + cmdMatch.index! + cmdMatch[0].indexOf('cmd');
          const cmdPos = this.document.positionAt(cmdOffset);
          this.tokenBuilder.addToken({
            line: cmdPos.line,
            char: cmdPos.character,
            length: 3,
            tokenType: 'cmdLanguage', // Distinct from js/py/sh
            modifiers: []
          });

          // Tokenize braces for cmd blocks (namespace + readonly for dim appearance)
          const afterCmd = nodeText.substring(runMatch.index! + runMatch[0].length + cmdMatch.index! + cmdMatch[0].length);
          const openBraceMatch = afterCmd.match(/^\s*\{/);
          if (openBraceMatch) {
            const openBraceOffset = cmdOffset + 3 + openBraceMatch.index! + openBraceMatch[0].indexOf('{');
            const openBracePos = this.document.positionAt(openBraceOffset);
            this.tokenBuilder.addToken({
              line: openBracePos.line,
              char: openBracePos.character,
              length: 1,
              tokenType: 'namespace',
              modifiers: ['readonly']
            });

            // Find closing brace
            const closeBraceIndex = nodeText.lastIndexOf('}');
            if (closeBraceIndex !== -1) {
              const closeBraceOffset = effectiveLocation.start.offset + closeBraceIndex;
              const closeBracePos = this.document.positionAt(closeBraceOffset);
              this.tokenBuilder.addToken({
                line: closeBracePos.line,
                char: closeBracePos.character,
                length: 1,
                tokenType: 'namespace',
                modifiers: ['readonly']
              });

              // Tokenize code content inside braces (cmd blocks = shell commands)
              const contentStart = openBraceOffset + openBraceMatch[0].length;
              const codeContent = nodeText.substring(contentStart, closeBraceIndex);
              this.tokenizeCodeWithVariables(
                codeContent,
                effectiveLocation.start.offset + contentStart,
                'cmd'
              );
            }
          }
        } else if (langMatch) {
          const lang = langMatch[1];
          const langOffset = runOffset + 3 + langMatch.index! + langMatch[0].indexOf(lang);
          const langPos = this.document.positionAt(langOffset);
          this.tokenBuilder.addToken({
            line: langPos.line,
            char: langPos.character,
            length: lang.length,
            tokenType: 'embedded', // Same as top-level js/py/sh
            modifiers: []
          });

          // Tokenize braces for lang blocks (namespace for standout appearance)
          const afterLang = nodeText.substring(runMatch.index! + runMatch[0].length + langMatch.index! + langMatch[0].length);
          const openBraceMatch = afterLang.match(/^\s*\{/);
          if (openBraceMatch) {
            const openBraceOffset = langOffset + lang.length + openBraceMatch.index! + openBraceMatch[0].indexOf('{');
            const openBracePos = this.document.positionAt(openBraceOffset);
            this.tokenBuilder.addToken({
              line: openBracePos.line,
              char: openBracePos.character,
              length: 1,
              tokenType: 'namespace',
              modifiers: []
            });

            // Find closing brace
            const closeBraceIndex = nodeText.lastIndexOf('}');
            if (closeBraceIndex !== -1) {
              const closeBraceOffset = effectiveLocation.start.offset + closeBraceIndex;
              const closeBracePos = this.document.positionAt(closeBraceOffset);
              this.tokenBuilder.addToken({
                line: closeBracePos.line,
                char: closeBracePos.character,
                length: 1,
                tokenType: 'namespace',
                modifiers: []
              });

              // Tokenize code content inside braces
              const contentStart = openBraceOffset + openBraceMatch[0].length;
              const codeContent = nodeText.substring(contentStart, closeBraceIndex);
              this.tokenizeCodeWithVariables(
                codeContent,
                effectiveLocation.start.offset + contentStart,
                lang
              );
            }
          }
        }
      }
    }

    if (node.language) {
      if (node.languageLocation) {
        this.tokenBuilder.addToken({
          line: node.languageLocation.start.line - 1,
          char: node.languageLocation.start.column - 1,
          length: node.language.length,
          tokenType: 'embedded',
          modifiers: []
        });
      }
      
      if (node.codeLocation) {
        const newContext = {
          ...context,
          interpolationAllowed: false,
          commandLanguage: node.language
        };
        
        this.tokenBuilder.addToken({
          line: node.codeLocation.start.line - 1,
          char: node.codeLocation.start.column - 1,
          length: node.code?.length || 0,
          tokenType: 'embeddedCode',
          modifiers: []
        });
      }
    } else {
      const newContext = {
        ...context,
        inCommand: true,
        interpolationAllowed: true,
        variableStyle: '@var' as const
      };
      
      if (node.content && Array.isArray(node.content)) {
        for (const part of node.content) {
          this.mainVisitor.visitNode(part, newContext);
        }
      } else if (node.values && Array.isArray(node.values)) {
        for (const value of node.values) {
          this.mainVisitor.visitNode(value, newContext);
        }
      } else {
        this.visitChildren(node, newContext, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
      }
    }
  }

  private visitCodeNode(node: any, context: VisitorContext): void {
    // Handle code nodes (run js/node/py/sh blocks)
    if (process.env.DEBUG_LSP === 'true') {
      console.log('[CODE-NODE]', {
        language: node.language,
        hasRunKeyword: node.hasRunKeyword,
        code: node.code?.substring(0, 20)
      });
    }

    if (!node.language) return;

    // Reconstruct location from code content or use hasRunKeyword
    const sourceText = this.document.getText();

    // Search for the pattern "run <lang> {" in the document
    const pattern = node.hasRunKeyword
      ? new RegExp(`run\\s+${node.language}\\s*\\{`, 'g')
      : new RegExp(`${node.language}\\s*\\{`, 'g');

    let match;
    let foundMatch = null;

    // Search through all matches to find the one that contains our code
    while ((match = pattern.exec(sourceText)) !== null) {
      const codeStart = match.index + match[0].length;
      const searchCode = sourceText.substring(codeStart, codeStart + 100);
      if (node.code && searchCode.includes(node.code.substring(0, Math.min(20, node.code.length)))) {
        foundMatch = match;
        break;
      }
    }

    if (!foundMatch) return;

    const matchStart = foundMatch.index;

    if (node.hasRunKeyword) {
      // Tokenize 'run' keyword
      const runMatch = foundMatch[0].match(/^run/);
      if (runMatch) {
        const runPos = this.document.positionAt(matchStart);
        this.tokenBuilder.addToken({
          line: runPos.line,
          char: runPos.character,
          length: 3,
          tokenType: 'directiveAction',
          modifiers: []
        });
      }
    }

    // Tokenize language identifier (js/node/py/sh)
    const langMatch = foundMatch[0].match(new RegExp(`\\b${node.language}\\b`));
    if (langMatch) {
      const langOffset = matchStart + foundMatch[0].indexOf(node.language);
      const langPos = this.document.positionAt(langOffset);
      this.tokenBuilder.addToken({
        line: langPos.line,
        char: langPos.character,
        length: node.language.length,
        tokenType: 'embedded', // js/py/sh/node use embedded type
        modifiers: []
      });
    }

    // Tokenize opening brace (namespace for standout)
    const openBraceMatch = foundMatch[0].match(/\{/);
    if (openBraceMatch) {
      const braceOffset = matchStart + foundMatch[0].indexOf('{');
      const bracePos = this.document.positionAt(braceOffset);
      this.tokenBuilder.addToken({
        line: bracePos.line,
        char: bracePos.character,
        length: 1,
        tokenType: 'namespace',
        modifiers: []
      });

      // Find closing brace
      const codeStart = braceOffset + 1;
      let depth = 1;
      let closeBraceOffset = -1;
      for (let i = codeStart; i < sourceText.length && depth > 0; i++) {
        if (sourceText[i] === '{') depth++;
        if (sourceText[i] === '}') {
          depth--;
          if (depth === 0) {
            closeBraceOffset = i;
            break;
          }
        }
      }

      if (closeBraceOffset !== -1) {
        const closeBracePos = this.document.positionAt(closeBraceOffset);
        this.tokenBuilder.addToken({
          line: closeBracePos.line,
          char: closeBracePos.character,
          length: 1,
          tokenType: 'namespace',
          modifiers: []
        });
      }
    }
  }

  private visitExecInvocation(node: any, context: VisitorContext): void {
    if (process.env.DEBUG) {
      console.log('[EXEC-INVOCATION-VISITOR]', {
        hasCommandRef: !!node.commandRef,
        name: node.commandRef?.name,
        location: node.location
      });
    }

    if (node.commandRef && node.commandRef.name) {
      const name = node.commandRef.name;
      
      // Handle case where location is 'none' or undefined - use identifier location
      if (node.location === 'none' || !node.location) {
        if (process.env.DEBUG) {
          console.log('[EXEC-INV] Using identifier location path');
        }
        if (process.env.DEBUG_LSP === 'true') {
          console.log('[EXEC-INVOCATION]', {
            name: node.commandRef.name,
            hasIdentifier: !!node.commandRef.identifier,
            identifierLength: node.commandRef.identifier?.length,
            firstIdentifier: node.commandRef.identifier?.[0]
          });
        }
        
        if (!node.commandRef.identifier?.[0]?.location) {
          // Can't process without location info
          return;
        }
        const identifierLoc = node.commandRef.identifier[0].location;

        const source = this.document.getText();
        const includesAt = source.charAt(identifierLoc.start.offset) === '@';

        // IMPORTANT: AST locations can be wrong for ExecInvocations in templates
        // Verify @ symbol is actually at the expected position before tokenizing
        if (!includesAt) {
          // Location is wrong - search forward for the actual @ symbol
          const searchStart = identifierLoc.start.offset;
          const searchEnd = Math.min(searchStart + 100, source.length);
          const searchText = source.substring(searchStart, searchEnd);
          const atIndex = searchText.indexOf('@' + name);

          if (atIndex !== -1) {
            // Found the actual @ symbol position
            const actualOffset = searchStart + atIndex;
            const actualPos = this.document.positionAt(actualOffset);

            this.tokenBuilder.addToken({
              line: actualPos.line,
              char: actualPos.character,
              length: name.length + 1, // Include @ in length
              tokenType: 'function',
              modifiers: ['reference']
            });

            // Update identifierLoc for args processing below
            identifierLoc.start.line = actualPos.line + 1; // Convert back to 1-based
            identifierLoc.start.column = actualPos.character + 1;
            identifierLoc.start.offset = actualOffset;
          } else {
            // Can't find the @ symbol - skip tokenization to avoid wrong position
            return;
          }
        } else {
          // Location is correct - use it directly
          const atCharPos = identifierLoc.start.column - 1;

          if (process.env.DEBUG) {
            console.log('[EXEC-INV-NOLOC]', { name, atCharPos, includesAt });
          }

          // Tokenize @functionName as a single token for consistent coloring
          if (name && typeof name === 'string' && name.length > 0 && atCharPos >= 0) {
            this.tokenBuilder.addToken({
              line: identifierLoc.start.line - 1,
              char: atCharPos,
              length: name.length + 1, // Include @ in length
              tokenType: 'function',
              modifiers: ['reference']
            });
          }
        }
        
        // If there are args, add parentheses
        if (node.commandRef.args && node.commandRef.args.length >= 0) {
          // Add opening parenthesis
          this.tokenBuilder.addToken({
            line: identifierLoc.start.line - 1,
            char: atCharPos + name.length + 1, // After @ + name
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
          
          // Process arguments
          const newContext = {
            ...context,
            inCommand: true,
            interpolationAllowed: true,
            variableStyle: '@var' as const,
            inFunctionArgs: true
          };
          
          for (let i = 0; i < node.commandRef.args.length; i++) {
            const arg = node.commandRef.args[i];
            
            // Handle primitive values (numbers, strings, etc.) that aren't AST nodes
            if (typeof arg !== 'object' || arg === null || !arg.type) {
              // This is a primitive value - need to find its position in the source
              const sourceText = this.document.getText();
              const funcName = node.commandRef.name;
              const searchStart = identifierLoc.start.offset + funcName.length + 2; // After @name(
              
              // For now, just tokenize based on type
              const argStr = String(arg);
              const argIndex = sourceText.indexOf(argStr, searchStart);
              
              if (argIndex !== -1) {
                const argPos = this.document.positionAt(argIndex);
                let tokenType = 'string';
                
                if (typeof arg === 'number') {
                  tokenType = 'number';
                } else if (typeof arg === 'boolean') {
                  tokenType = 'keyword';
                } else if (arg === null) {
                  tokenType = 'keyword';
                }
                
                this.tokenBuilder.addToken({
                  line: argPos.line,
                  char: argPos.character,
                  length: argStr.length,
                  tokenType: tokenType,
                  modifiers: []
                });
              }
            } else {
              // Regular AST node
              if (process.env.DEBUG_LSP === 'true') {
                console.log('[CMD-ARG]', {
                  argType: arg.type,
                  argIdentifier: arg.identifier,
                  hasFields: !!arg.fields
                });
              }
              this.mainVisitor.visitNode(arg, newContext);
            }
            
            // Add comma between args
            if (i < node.commandRef.args.length - 1) {
              const currentArg = node.commandRef.args[i];
              const nextArg = node.commandRef.args[i + 1];
              
              // Get the end position of the current arg
              let currentArgEnd = null;
              if (currentArg?.location) {
                currentArgEnd = currentArg.location.end.offset;
              } else if (typeof currentArg !== 'object' || currentArg === null || !currentArg.type) {
                // For primitive values, estimate based on string length
                const sourceText = this.document.getText();
                const argStr = String(currentArg);
                const searchStart = identifierLoc.start.offset + name.length + 2; // After @name(
                const argIndex = sourceText.indexOf(argStr, searchStart);
                if (argIndex !== -1) {
                  currentArgEnd = argIndex + argStr.length;
                }
              }
              
              // Get the start position of the next arg
              let nextArgStart = null;
              if (nextArg?.location) {
                nextArgStart = nextArg.location.start.offset;
              } else if (typeof nextArg !== 'object' || nextArg === null || !nextArg.type) {
                // For primitive values, search for it after current arg
                const sourceText = this.document.getText();
                const nextArgStr = String(nextArg);
                if (currentArgEnd) {
                  const nextArgIndex = sourceText.indexOf(nextArgStr, currentArgEnd);
                  if (nextArgIndex !== -1) {
                    nextArgStart = nextArgIndex;
                  }
                }
              }
              
              // Find comma between the args
              if (currentArgEnd && nextArgStart) {
                const sourceText = this.document.getText();
                const betweenText = sourceText.substring(currentArgEnd, nextArgStart);
                const commaIndex = betweenText.indexOf(',');
                
                if (commaIndex !== -1) {
                  const commaOffset = currentArgEnd + commaIndex;
                  const commaPos = this.document.positionAt(commaOffset);
                  this.tokenBuilder.addToken({
                    line: commaPos.line,
                    char: commaPos.character,
                    length: 1,
                    tokenType: 'operator',
                    modifiers: []
                  });
                }
              }
            }
          }
          
          // Add closing parenthesis
          // Calculate based on the identifier end + args
          const lastArg = node.commandRef.args[node.commandRef.args.length - 1];
          if (lastArg?.location) {
            // Find the closing parenthesis in the source text
            const sourceText = this.document.getText();
            const searchStart = lastArg.location.end.offset;
            const searchEnd = Math.min(searchStart + 10, sourceText.length);
            const searchText = sourceText.substring(searchStart, searchEnd);
            const closeParenIndex = searchText.indexOf(')');
            
            if (closeParenIndex !== -1) {
              const closeParenOffset = searchStart + closeParenIndex;
              const closeParenPos = this.document.positionAt(closeParenOffset);
              this.tokenBuilder.addToken({
                line: closeParenPos.line,
                char: closeParenPos.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          } else {
            // Empty args - put paren right after opening paren
            this.tokenBuilder.addToken({
              line: identifierLoc.start.line - 1,
              char: atCharPos + name.length + 2, // After @ + name + (
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
        return;
      }
      
      // Original code for when location is available
      if (process.env.DEBUG) {
        console.log('[EXEC-INV] Using node location path');
      }

      if (!node.location || typeof node.location !== 'object') {
        if (process.env.DEBUG) {
          console.log('[EXEC-INV] Returning early - bad location', { location: node.location });
        }
        return;
      }
      const source = this.document.getText();
      const hasValidName = name && typeof name === 'string' && name.length > 0;

      // Check if this is a method call (has objectReference) vs simple function call
      const isMethodCall = !!node.commandRef.objectReference;

      if (process.env.DEBUG) {
        console.log('[EXEC-INV] Tokenizing exec invocation', {
          name,
          isMethodCall,
          hasObjectRef: !!node.commandRef.objectReference
        });
      }

      let methodEndOffset: number;

      // Check for chained method calls (objectSource is an ExecInvocation)
      const isChainedMethodCall = !!node.commandRef.objectSource;

      if (isChainedMethodCall && node.commandRef.objectSource) {
        // CHAINED METHOD CALL: @object.method1().method2(args)
        // 1. Visit the inner ExecInvocation (recursively handles the chain)
        this.visitExecInvocation(node.commandRef.objectSource, context);

        // 2. Find and tokenize this method name (from identifier or just the name)
        // For chained calls, identifier[0] is usually a Text node, not VariableReference
        const identifier = node.commandRef.identifier?.[0];
        const methodName = node.commandRef.name;

        if (methodName && typeof methodName === 'string') {
          // Find the position of the method name in source
          // It should be after the previous method's closing paren
          const searchStart = node.location?.start?.offset || 0;
          const methodOffset = source.indexOf(methodName, searchStart);

          if (methodOffset !== -1) {
            // Tokenize the dot before the method (if present)
            if (source[methodOffset - 1] === '.') {
              const dotPos = this.document.positionAt(methodOffset - 1);
              this.tokenBuilder.addToken({
                line: dotPos.line,
                char: dotPos.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }

            // Tokenize the method name
            const methodPos = this.document.positionAt(methodOffset);
            this.tokenBuilder.addToken({
              line: methodPos.line,
              char: methodPos.character,
              length: methodName.length,
              tokenType: 'function',
              modifiers: ['reference']
            });

            methodEndOffset = methodOffset + methodName.length;
          }
        }
      } else if (isMethodCall && node.commandRef.objectReference) {
        // METHOD CALL or COMPUTED CALL: @object.method(args) or @object[@key](args)

        // Check what kind of call this is
        const identifier = node.commandRef.identifier?.[0];
        if (identifier?.fields && identifier.fields.length > 0) {
          const lastField = identifier.fields[identifier.fields.length - 1];

          if (lastField?.type === 'variableIndex') {
            // COMPUTED PROPERTY CALL: @obj[@key](args)
            // Visit identifier[0] which contains the variableIndex field with nested VariableReference
            this.mainVisitor.visitNode(identifier, context);

            if (lastField.location) {
              methodEndOffset = lastField.location.end.offset;
            }
          } else if (lastField?.type === 'field' && lastField.location && lastField.value) {
            // REGULAR METHOD CALL: @obj.method(args)
            // Visit the objectReference for base variable
            this.mainVisitor.visitNode(node.commandRef.objectReference, context);

            // Tokenize the dot before the method
            const dotOffset = lastField.location.start.offset - 1;
            if (source[dotOffset] === '.') {
              const dotPos = this.document.positionAt(dotOffset);
              this.tokenBuilder.addToken({
                line: dotPos.line,
                char: dotPos.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }

            // Tokenize the method name
            const methodPos = this.document.positionAt(lastField.location.start.offset);
            this.tokenBuilder.addToken({
              line: methodPos.line,
              char: methodPos.character,
              length: lastField.value.length,
              tokenType: 'function',
              modifiers: ['reference']
            });

            methodEndOffset = lastField.location.end.offset;
          }
        }
      } else {
        // SIMPLE FUNCTION CALL: @functionName(args)
        const includesAt = source.charAt(node.location.start.offset) === '@';

        // IMPORTANT: AST locations can be wrong for ExecInvocations in templates
        // Verify @ symbol is actually at the expected position before tokenizing
        if (!includesAt) {
          // Location is wrong - search forward for the actual @ symbol
          const searchStart = node.location.start.offset;
          const searchEnd = Math.min(searchStart + 100, source.length);
          const searchText = source.substring(searchStart, searchEnd);
          const atIndex = searchText.indexOf('@' + name);

          if (atIndex !== -1) {
            // Found the actual @ symbol position
            const actualOffset = searchStart + atIndex;
            const actualPos = this.document.positionAt(actualOffset);

            this.tokenBuilder.addToken({
              line: actualPos.line,
              char: actualPos.character,
              length: name.length + 1, // Include @ in length
              tokenType: 'function',
              modifiers: ['reference']
            });

            methodEndOffset = actualOffset + name.length + 1;
          } else {
            // Can't find the @ symbol - skip tokenization to avoid wrong position
            methodEndOffset = node.location.start.offset;
          }
        } else {
          // Location is correct - use it directly
          const charPos = node.location.start.column - 1;
          const atCharPos = charPos;

          // Tokenize @functionName as a single token for consistent coloring
          if (hasValidName && atCharPos >= 0) {
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: atCharPos,
              length: name.length + 1, // Include @ in length
              tokenType: 'function',
              modifiers: ['reference']
            });
          }

          methodEndOffset = node.location.start.offset + name.length + 1;
        }
      }

      // Add opening parenthesis (only if we have valid name for position calculation)
      if (hasValidName && node.commandRef.args && Array.isArray(node.commandRef.args)) {
        // Find the opening paren in the source
        const openParenOffset = source.indexOf('(', methodEndOffset - 1);
        if (openParenOffset !== -1) {
          const openParenPos = this.document.positionAt(openParenOffset);
          this.tokenBuilder.addToken({
            line: openParenPos.line,
            char: openParenPos.character,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }

        const newContext = {
          ...context,
          inCommand: true,
          interpolationAllowed: true,
          variableStyle: '@var' as const,
          inFunctionArgs: true
        };
        
        for (let i = 0; i < node.commandRef.args.length; i++) {
          const arg = node.commandRef.args[i];
          
          // Handle primitive values (numbers, strings, etc.) that aren't AST nodes
          if (typeof arg !== 'object' || arg === null || !arg.type) {
            // This is a primitive value - need to find its position in the source
            const sourceText = this.document.getText();
            const funcName = node.commandRef.name;
            const searchStart = node.location.start.offset + funcName.length + 2; // After @name(
            
            // For now, just tokenize based on type
            const argStr = String(arg);
            const argIndex = sourceText.indexOf(argStr, searchStart);
            
            if (argIndex !== -1) {
              const argPos = this.document.positionAt(argIndex);
              let tokenType = 'string';
              
              if (typeof arg === 'number') {
                tokenType = 'number';
              } else if (typeof arg === 'boolean') {
                tokenType = 'keyword';
              } else if (arg === null) {
                tokenType = 'keyword';
              }
              
              this.tokenBuilder.addToken({
                line: argPos.line,
                char: argPos.character,
                length: argStr.length,
                tokenType: tokenType,
                modifiers: []
              });
            }
          } else if (arg.type === 'Text' && arg.location) {
            // For Text nodes (string arguments), the AST location includes the quotes
            // We need to use the actual span from the AST
            const tokenStart = arg.location.start.column - 1; // Convert 1-based to 0-based
            const tokenLength = arg.location.end.column - arg.location.start.column;
            
            if (process.env.DEBUG_LSP === 'true') {
              console.log('[STRING-ARG]', {
                content: arg.content,
                start: arg.location.start,
                end: arg.location.end,
                tokenStart,
                tokenLength,
                calc: `${arg.location.end.column} - ${arg.location.start.column} = ${tokenLength}`
              });
            }
            
            this.tokenBuilder.addToken({
              line: arg.location.start.line - 1,
              char: tokenStart,
              length: tokenLength,
              tokenType: 'string',
              modifiers: []
            });
          } else {
            this.mainVisitor.visitNode(arg, newContext);
          }
          
          // Add comma between args
          if (i < node.commandRef.args.length - 1) {
            // For args with location, use the helper
            if (arg.location && typeof arg === 'object' && arg.type) {
              const nextArg = node.commandRef.args[i + 1];
              if (nextArg.location && typeof nextArg === 'object' && nextArg.type) {
                this.operatorHelper.tokenizeOperatorBetween(
                  arg.location.end.offset,
                  nextArg.location.start.offset,
                  ','
                );
              }
            }
          }
        }
        
        // Add closing parenthesis
        // Find the actual closing paren position in the source
        const sourceText = this.document.getText();
        const funcStartOffset = node.location.start.offset;
        const nodeText = sourceText.substring(funcStartOffset, node.location.end.offset);
        
        // Find the first closing paren (which should be for our function call)
        const closeParenIndex = nodeText.indexOf(')');
        if (closeParenIndex !== -1) {
          const closeParenOffset = funcStartOffset + closeParenIndex;
          const closeParenPos = this.document.positionAt(closeParenOffset);
          
          this.tokenBuilder.addToken({
            line: closeParenPos.line,
            char: closeParenPos.character,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }
      } // Close hasValidName && args if

      // Handle args for cases where hasValidName is false (e.g., computed property calls)
      // where name is an object instead of a string
      if (!hasValidName && node.commandRef.args && Array.isArray(node.commandRef.args) && node.commandRef.args.length > 0) {
        const newContext = {
          ...context,
          inCommand: true,
          interpolationAllowed: true,
          variableStyle: '@var' as const,
          inFunctionArgs: true
        };

        for (const arg of node.commandRef.args) {
          if (arg && typeof arg === 'object' && arg.type) {
            this.mainVisitor.visitNode(arg, newContext);
          }
        }
      }

      // Handle withClause pipeline (for pipes after function calls)
      if (node.withClause && node.withClause.pipeline) {
        // The pipes are in a different structure for ExecInvocation
        // They're in withClause.pipeline as an array of command-like objects
        for (const pipeCommand of node.withClause.pipeline) {
          // Find and tokenize the pipe operator ('|' or '||')
          const sourceText = this.document.getText();
          
          // The pipe should be between the previous element and this command
          if (pipeCommand.identifier && pipeCommand.identifier.length > 0) {
            const pipeIdentifier = pipeCommand.identifier[0];
            if (pipeIdentifier.location) {
              // Search backwards from the identifier to find the pipe
              const searchStart = Math.max(0, pipeIdentifier.location.start.offset - 5);
              const searchText = sourceText.substring(searchStart, pipeIdentifier.location.start.offset);
              const pipeIndex = searchText.lastIndexOf('|');
              
              if (pipeIndex !== -1) {
                const pipeOffset = searchStart + pipeIndex;
                const isParallel = pipeIndex > 0 && searchText[pipeIndex - 1] === '|';
                const pipePos = this.document.positionAt(isParallel ? pipeOffset - 1 : pipeOffset);
                const length = isParallel ? 2 : 1;
                
                this.tokenBuilder.addToken({
                  line: pipePos.line,
                  char: pipePos.character,
                  length,
                  tokenType: 'operator',
                  modifiers: []
                });
              }
            }
            
            // Process the identifier (which is the transform)
            for (const id of pipeCommand.identifier) {
              this.mainVisitor.visitNode(id, context);
            }
          }
        }
      }
    }
  }
  
  /**
   * Tokenize code content with @variable interpolation support
   * Used for nested cmd/js/sh blocks inside for/exe/when
   */
  private tokenizeCodeWithVariables(code: string, startOffset: number, language: string): void {
    const varPattern = /@[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g;
    const lines = code.split('\n');
    const startPosition = this.document.positionAt(startOffset);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineText = lines[lineIndex];
      const currentLine = startPosition.line + lineIndex;
      const lineStartChar = lineIndex === 0 ? startPosition.character : 0;

      let lastIndex = 0;
      let match: RegExpExecArray | null;
      varPattern.lastIndex = 0;

      while ((match = varPattern.exec(lineText)) !== null) {
        // Tokenize string content before the variable
        if (match.index > lastIndex) {
          const beforeText = lineText.substring(lastIndex, match.index);
          this.tokenBuilder.addToken({
            line: currentLine,
            char: lineStartChar + lastIndex,
            length: beforeText.length,
            tokenType: 'string',
            modifiers: ['italic']
          });
        }

        // Tokenize the variable
        this.tokenBuilder.addToken({
          line: currentLine,
          char: lineStartChar + match.index,
          length: match[0].length,
          tokenType: 'interpolation',
          modifiers: []
        });

        lastIndex = match.index + match[0].length;
      }

      // Tokenize remaining string content after last variable
      if (lastIndex < lineText.length) {
        const afterText = lineText.substring(lastIndex);
        this.tokenBuilder.addToken({
          line: currentLine,
          char: lineStartChar + lastIndex,
          length: afterText.length,
          tokenType: 'string',
          modifiers: ['italic']
        });
      }
    }
  }

  private visitCommandReference(node: any, context: VisitorContext): void {
    // Check for invalid location
    if (!node.location || node.location.start.column <= 0) {
      if (process.env.DEBUG) {
        console.log('[CMD-REF] Invalid location', { location: node.location, name: node.name });
      }
      return;
    }

    const char = node.location.start.column - 1;
    const length = node.name?.length || 0;

    // Validate before creating token
    if (char >= 0 && length > 0) {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char,
        length,
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
    } else if (process.env.DEBUG) {
      console.log('[CMD-REF] Skipping invalid token', { char, length, name: node.name, column: node.location.start.column });
    }
  }
}
