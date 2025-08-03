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
      default:
        this.visitCommand(node, context);
    }
  }
  
  private visitCommand(node: any, context: VisitorContext): void {
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
  
  private visitExecInvocation(node: any, context: VisitorContext): void {
    if (node.commandRef && node.commandRef.name) {
      const name = node.commandRef.name;
      
      // Handle case where location is 'none' or undefined - use identifier location
      if (node.location === 'none' || !node.location) {
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
        
        // Add the @ and function name
        this.tokenBuilder.addToken({
          line: identifierLoc.start.line - 1,
          char: identifierLoc.start.column - 1,
          length: name.length + 1, // +1 for @
          tokenType: 'variable',
          modifiers: []
        });
        
        // If there are args, add parentheses
        if (node.commandRef.args && node.commandRef.args.length >= 0) {
          // Add opening parenthesis
          this.tokenBuilder.addToken({
            line: identifierLoc.start.line - 1,
            char: identifierLoc.start.column - 1 + name.length + 1, // After @name
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
              char: identifierLoc.start.column - 1 + name.length + 2, // After @name(
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
        return;
      }
      
      // Original code for when location is available
      if (!node.location || typeof node.location !== 'object') {
        return;
      }
      const charPos = node.location.start.column - 1;
      
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: charPos,
        length: name.length + 1,
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
      
      if (node.commandRef.args && Array.isArray(node.commandRef.args)) {
        // Add opening parenthesis
        const openParenPos = charPos + name.length + 1;
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: openParenPos,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        
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
            // For Text nodes (string arguments), tokenize with quotes
            // For string arguments in function invocations, we need to include the quotes
            // The AST gives column 20 (1-based) for "World", which is actually the quote position
            // We just need to convert to 0-based indexing
            const quotedStart = arg.location.start.column - 1; // Convert 1-based to 0-based
            const quotedLength = arg.content.length + 2; // Include both quotes
            
            this.tokenBuilder.addToken({
              line: arg.location.start.line - 1,
              char: quotedStart,
              length: quotedLength,
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
        // The ExecInvocation node ends right after the closing paren
        // So the closing paren is at end.column - 1
        this.tokenBuilder.addToken({
          line: node.location.end.line - 1,
          char: node.location.end.column - 2, // -1 for 0-based, -1 for the paren position
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
    }
  }
  
  private visitCommandReference(node: any, context: VisitorContext): void {
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.name?.length || 0,
      tokenType: 'variableRef',
      modifiers: ['reference']
    });
  }
}