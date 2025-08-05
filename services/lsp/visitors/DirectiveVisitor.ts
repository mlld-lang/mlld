import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { LocationHelpers } from '@services/lsp/utils/LocationHelpers';
import { TextExtractor } from '@services/lsp/utils/TextExtractor';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';
import { CommentTokenHelper } from '@services/lsp/utils/CommentTokenHelper';
import { LanguageBlockHelper } from '@services/lsp/utils/LanguageBlockHelper';
import { embeddedLanguageService } from '@services/lsp/embedded/EmbeddedLanguageService';

export class DirectiveVisitor extends BaseVisitor {
  private mainVisitor: any;
  private operatorHelper: OperatorTokenHelper;
  private commentHelper: CommentTokenHelper;
  private languageHelper: LanguageBlockHelper;
  
  constructor(document: any, tokenBuilder: any) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
    this.commentHelper = new CommentTokenHelper(document, tokenBuilder);
    this.languageHelper = new LanguageBlockHelper(document, tokenBuilder);
  }
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'Directive';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    
    // Only add directive token if not an implicit directive
    if (!node.meta?.implicit && node.kind) {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: (node.kind?.length || 0) + 1,
        tokenType: 'directive',
        modifiers: []
      });
    }
    
    if (node.kind === 'when') {
      this.visitWhenDirective(node, context);
      return;
    }
    
    if (node.kind === 'output') {
      this.visitOutputDirective(node, context);
      return;
    }
    
    if (node.kind === 'import') {
      this.visitImportDirective(node, context);
      return;
    }
    
    if (node.kind === 'for') {
      this.visitForDirective(node, context);
      return;
    }
    
    // Handle implicit exe directives (e.g., @transform() = @applyFilter(@data))
    if (node.kind === 'exe' && node.meta?.implicit && node.values?.commandRef) {
      // Token for @commandName
      const commandName = node.values.commandRef.name;
      if (commandName && node.location) {
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: (commandName?.length || 0) + 1, // +1 for @
          tokenType: 'variable',
          modifiers: ['declaration']
        });
        
        // Add parentheses if present
        const hasParens = node.values.commandRef.args !== undefined;
        if (hasParens && commandName) {
          // Opening parenthesis
          this.operatorHelper.addOperatorToken(
            node.location.start.offset + (commandName?.length || 0) + 1, // after @name
            1
          );
          
          // Process arguments if any
          if (node.values.commandRef.args && node.values.commandRef.args.length > 0) {
            for (const arg of node.values.commandRef.args) {
              this.mainVisitor.visitNode(arg, context);
            }
          }
          
          // Closing parenthesis - need to find it
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          const closeParenMatch = nodeText.match(/\)/);
          if (closeParenMatch && closeParenMatch.index !== undefined) {
            const closeParenPosition = this.document.positionAt(node.location.start.offset + closeParenMatch.index);
            this.tokenBuilder.addToken({
              line: closeParenPosition.line,
              char: closeParenPosition.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
        
        // Add = operator if there's a value
        if (node.values.value) {
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          const equalMatch = nodeText.match(/\)\s*=|\s+=/); // Match ) = or just =
          if (equalMatch && equalMatch.index !== undefined) {
            const equalIndex = equalMatch[0].indexOf('=');
            const equalPosition = this.document.positionAt(
              node.location.start.offset + equalMatch.index + equalIndex
            );
            this.tokenBuilder.addToken({
              line: equalPosition.line,
              char: equalPosition.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
    }
    
    if ((node.kind === 'var' || node.kind === 'exe' || node.kind === 'path') && 
        node.values?.identifier) {
      // For /exe with params, handle variable declaration without = first
      if (node.kind === 'exe' && node.values?.params && node.values.params.length > 0) {
        this.handleVariableDeclaration(node, true); // Skip = operator for now
        
        // Add opening parenthesis
        const firstParam = node.values.params[0];
        if (firstParam && firstParam.location) {
          this.operatorHelper.addOperatorToken(
            firstParam.location.start.offset - 1, // '(' is before param
            1
          );
        }
        
        // Process parameters
        for (let i = 0; i < node.values.params.length; i++) {
          const param = node.values.params[i];
          this.mainVisitor.visitNode(param, context);
          
          // Add comma after each parameter except the last
          if (i < node.values.params.length - 1 && param.location) {
            const nextParam = node.values.params[i + 1];
            if (nextParam && nextParam.location) {
              this.operatorHelper.tokenizeOperatorBetween(
                param.location.end.offset,
                nextParam.location.start.offset,
                ','
              );
            }
          }
        }
        
        // Add closing parenthesis
        const lastParam = node.values.params[node.values.params.length - 1];
        if (lastParam && lastParam.location) {
          // The closing parenthesis is right after the last parameter
          this.operatorHelper.addOperatorToken(
            lastParam.location.end.offset,
            1
          );
        }
        
        // Now add the = operator after the closing parenthesis
        if (node.values.value !== undefined || node.values.template !== undefined || 
            node.values.command !== undefined || node.values.code !== undefined ||
            node.values.content !== undefined || node.meta?.wrapperType !== undefined) {
          // Find the = sign in the source text after the closing parenthesis
          const equalOffset = this.operatorHelper.findOperatorNear(
            lastParam.location.end.offset,
            '=',
            10,
            'forward'
          );
          
          if (equalOffset !== null) {
            this.operatorHelper.addOperatorToken(equalOffset, 1);
          }
        }
      } else {
        // For other directives or exe without params, handle normally
        this.handleVariableDeclaration(node);
      }
      
      // Special handling for /exe with params and string template
      if (node.kind === 'exe' && node.values?.params && node.values?.template && 
          node.meta?.wrapperType === 'doubleQuote') {
        // For simple string templates in exe directives, tokenize as a single string
        const sourceText = this.document.getText();
        const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
        const equalIndex = nodeText.indexOf('=');
        
        if (equalIndex !== -1) {
          const afterEqual = nodeText.substring(equalIndex + 1).trim();
          const stringStart = node.location.start.offset + nodeText.indexOf('"', equalIndex);
          const stringEnd = node.location.start.offset + nodeText.lastIndexOf('"') + 1;
          const stringLength = stringEnd - stringStart;
          
          if (stringLength > 0) {
            const stringPosition = this.document.positionAt(stringStart);
            this.tokenBuilder.addToken({
              line: stringPosition.line,
              char: stringPosition.character,
              length: stringLength,
              tokenType: 'string',
              modifiers: []
            });
          }
        }
        return; // Skip normal processing
      }
    }
    
    if (node.values) {
      this.visitDirectiveValues(node, context);
    }
    
    // Handle end-of-line comments
    if (node.meta?.comment) {
      this.visitEndOfLineComment(node.meta.comment);
    }
  }
  
  private visitEndOfLineComment(comment: any): void {
    if (!comment.location) return;
    
    if (process.env.DEBUG_LSP || this.document.uri.includes('test-syntax')) {
      console.log('[EOL-COMMENT]', {
        marker: comment.marker,
        content: comment.content,
        location: `${comment.location.start.line}:${comment.location.start.column}-${comment.location.end.line}:${comment.location.end.column}`,
        offset: `${comment.location.start.offset}-${comment.location.end.offset}`
      });
    }
    
    this.commentHelper.tokenizeEndOfLineComment(comment);
  }
  
  private handleVariableDeclaration(node: any, skipEquals: boolean = false): void {
    const identifierNodes = node.values.identifier;
    if (Array.isArray(identifierNodes) && identifierNodes.length > 0) {
      const firstIdentifier = identifierNodes[0];
      const identifierName = firstIdentifier.identifier || '';
      
      if (identifierName) {
        // For implicit directives, the identifier starts at the beginning
        const identifierStart = node.meta?.implicit 
          ? node.location.start.column 
          : node.location.start.column + node.kind.length + 2;
        
        
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: identifierStart - 1,
          length: identifierName.length + 1,
          tokenType: 'variable',
          modifiers: ['declaration']
        });
        
        // Add = operator token if there's a value (unless skipEquals is true)
        if (!skipEquals && (node.values.value !== undefined || node.values.template !== undefined || 
            node.values.command !== undefined || node.values.code !== undefined ||
            node.values.content !== undefined || node.meta?.wrapperType !== undefined)) {
          // Calculate position after variable name (including @)
          let baseOffset;
          if (node.meta?.implicit) {
            // For implicit directives, the identifier location spans the whole assignment
            // So we need to search from the start + identifier length
            baseOffset = firstIdentifier.location.start.offset + identifierName.length + 1; // +1 for @
          } else {
            baseOffset = node.location.start.offset + identifierStart + identifierName.length;
          }
          
          // For /exe with params, = comes after the closing parenthesis
          if (node.kind === 'exe' && node.values.params && node.values.params.length > 0) {
            const lastParam = node.values.params[node.values.params.length - 1];
            if (lastParam?.location) {
              const equalOffset = this.operatorHelper.findOperatorNear(
                lastParam.location.end.offset,
                '=',
                10,
                'forward'
              );
              if (equalOffset !== null) {
                this.operatorHelper.addOperatorToken(equalOffset, 1);
              }
            }
          } else {
            // Find = after the variable name
            const equalOffset = this.operatorHelper.findOperatorNear(
              baseOffset,
              '=',
              20,  // Increased search distance for implicit directives
              'forward'
            );
            
            
            if (equalOffset !== null) {
              this.operatorHelper.addOperatorToken(equalOffset, 1);
            }
          }
        }
      }
    }
  }
  
  private visitDirectiveValues(directive: any, context: VisitorContext): void {
    const values = directive.values;
    
    
    // Handle /show directives with content field first
    if (directive.kind === 'show' && values.content) {
      // Check for wrapperType in either location (meta or content[0])
      const wrapperType = directive.meta?.wrapperType || 
                         (values.content[0] && values.content[0].wrapperType);
      
      
      if (wrapperType) {
        // For show directives, the content structure is nested
        // values.content[0].content contains the actual template nodes
        const templateContent = values.content[0]?.content || values.content;
        
        const tempDirective = { 
          ...directive, 
          values: { ...values, value: templateContent },
          meta: { ...directive.meta, wrapperType }
        };
        this.visitTemplateValue(tempDirective, context);
        return;
      } else {
        // No wrapperType found, but we still need to process the content
        // This happens for show directives in for actions
        if (Array.isArray(values.content)) {
          for (const contentItem of values.content) {
            if (contentItem.content && Array.isArray(contentItem.content)) {
              // Process template content nodes
              for (const node of contentItem.content) {
                this.mainVisitor.visitNode(node, context);
              }
            } else {
              this.mainVisitor.visitNode(contentItem, context);
            }
          }
        }
        return;
      }
    }
    
    if (directive.kind === 'run') {
      this.visitRunDirective(directive, context);
      return;
    }
    
    if (directive.kind === 'exe' && values.template) {
      // Use visitTemplateValue to properly handle template delimiters
      this.visitTemplateValue(directive, context);
    } else if (directive.kind === 'exe' && values.code && directive.raw?.lang) {
      // Handle /exe with inline code
      this.visitInlineCode(directive, context);
    } else if (directive.meta?.wrapperType) {
      this.visitTemplateValue(directive, context);
    } else if (values.variable) {
      if (Array.isArray(values.variable)) {
        for (const varRef of values.variable) {
          this.mainVisitor.visitNode(varRef, context);
        }
      } else {
        this.mainVisitor.visitNode(values.variable, context);
      }
    } else if (values.command) {
      if (Array.isArray(values.command)) {
        const newContext = {
          ...context,
          inCommand: true,
          interpolationAllowed: true,
          variableStyle: '@var' as const
        };
        
        for (const part of values.command) {
          this.mainVisitor.visitNode(part, newContext);
        }
      } else {
        this.mainVisitor.visitNode(values.command, context);
      }
    } else if (values.expression) {
      this.mainVisitor.visitNode(values.expression, context);
    } else if (values.value && Array.isArray(values.value)) {
      // First handle the value array (e.g., load-content nodes)
      // Check if this is a code node array first
      if (values.value.length === 1 && values.value[0]?.type === 'code') {
        // This is inline code like /var @x = js { ... }
        this.visitInlineCode(directive, context);
      } else {
        for (const node of values.value) {
          if (typeof node === 'object' && node !== null) {
            this.mainVisitor.visitNode(node, context);
          } else if (directive.location) {
            this.handlePrimitiveValue(node, directive);
          }
        }
      }
      
      // Then handle withClause if present
      if (values.withClause) {
        this.visitWithClause(values.withClause, directive, context);
      }
    } else if (values.value !== undefined && directive.location) {
      // Check if the value is a WhenExpression object
      if (typeof values.value === 'object' && values.value !== null && values.value.type === 'WhenExpression') {
        this.mainVisitor.visitNode(values.value, context);
      } else {
        this.handlePrimitiveValue(values.value, directive);
      }
    } else if (values.loadContent) {
      // Handle file references with or without sections
      this.mainVisitor.visitNode(values.loadContent, context);
    } else if (values.code && directive.location) {
      // Handle inline code in /var and /exe directives (e.g., /var @x = js { return 42; })
      this.visitInlineCode(directive, context);
    }
    
    // Handle withClause for directives that don't have values.value
    if (values.withClause && !values.value) {
      this.visitWithClause(values.withClause, directive, context);
    }
    
    this.visitChildren(values, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
  }
  
  private visitWithClause(withClause: any, directive: any, context: VisitorContext): void {
    // Find the "as" keyword position
    const source = this.document.getText();
    const directiveText = source.substring(directive.location.start.offset, directive.location.end.offset);
    const asIndex = directiveText.lastIndexOf(' as ');
    
    if (asIndex !== -1) {
      // Token for "as" keyword
      this.tokenBuilder.addToken({
        line: directive.location.start.line - 1,
        char: directive.location.start.column - 1 + asIndex + 1, // +1 to skip the space before "as"
        length: 2,
        tokenType: 'keyword',
        modifiers: []
      });
    }
    
    // Handle the template after "as"
    if (withClause.asSection && Array.isArray(withClause.asSection)) {
      // Find the opening quote position - it comes after "as "
      const asKeywordEnd = asIndex + 4; // " as " is 4 characters
      const afterAs = directiveText.substring(asKeywordEnd);
      const openQuoteIndex = afterAs.indexOf('"');
      
      if (openQuoteIndex !== -1) {
        const openQuotePosition = asKeywordEnd + openQuoteIndex;
        
        // Token for opening quote
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + openQuotePosition,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        
        // Process nodes within the template
        for (const node of withClause.asSection) {
          if (node.type === 'Text' && node.location) {
            // Token for text content as string
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: node.location.start.column - 1,
              length: node.content.length,
              tokenType: 'string',
              modifiers: []
            });
          } else if (node.type === 'FileReference') {
            // Let FileReferenceVisitor handle the FileReference tokens
            this.mainVisitor.visitNode(node, context);
          }
        }
        
        // Find the closing quote position
        const closingQuoteIndex = directiveText.lastIndexOf('"');
        if (closingQuoteIndex !== -1 && closingQuoteIndex > openQuotePosition) {
          // Token for closing quote
          this.tokenBuilder.addToken({
            line: directive.location.start.line - 1,
            char: directive.location.start.column - 1 + closingQuoteIndex,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }
      }
    }
  }
  
  private visitRunDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;
    
    // Handle /run @function() syntax (including implicit directives)
    if (values?.execRef) {
      this.mainVisitor.visitNode(values.execRef, context);
      return;
    }
    
    // For simple tokenization (matching test expectations), tokenize the entire
    // command content as a single string token
    if (directive.location) {
      const sourceText = this.document.getText();
      const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
      
      // Handle /run {command} syntax
      const bracesMatch = directiveText.match(/^\/run\s*\{(.+)\}$/s);
      if (bracesMatch) {
        // Token for opening brace
        const openBraceOffset = directiveText.indexOf('{');
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + openBraceOffset,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        
        // Token for command content as a single string
        const commandContent = bracesMatch[1];
        const contentStart = openBraceOffset + 1;
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + contentStart,
          length: commandContent.length,
          tokenType: 'string',
          modifiers: []
        });
        
        // Token for closing brace
        const closeBraceOffset = directiveText.lastIndexOf('}');
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + closeBraceOffset,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        return;
      }
      
      // Handle /run "command" syntax
      const quotesMatch = directiveText.match(/^\/run\s*"(.+)"$/s);
      if (quotesMatch) {
        // Token for entire quoted string including quotes
        const quoteStart = directiveText.indexOf('"');
        const quoteEnd = directiveText.lastIndexOf('"');
        const totalLength = quoteEnd - quoteStart + 1;
        
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + quoteStart,
          length: totalLength,
          tokenType: 'string',
          modifiers: []
        });
        return;
      }
    }
    
    if (values?.lang) {
      const langText = TextExtractor.extract(Array.isArray(values.lang) ? values.lang : [values.lang]);
      if (langText && directive.location) {
        const langStart = directive.location.start.column + 4; // After "/run "
        
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: langStart,
          length: langText.length,
          tokenType: 'embedded',
          modifiers: []
        });
      }
      
      // For language-specific code blocks, use the language helper
      if (values.code && directive.location) {
        this.languageHelper.tokenizeCodeBlock(directive);
      }
    } else if (values.command && Array.isArray(values.command) && values.command.length > 0) {
      // This is the detailed tokenization path (not used by tests)
      const firstCommand = values.command[0];
      const lastCommand = values.command[values.command.length - 1];
      
      // Use language helper for brace tokenization
      this.languageHelper.tokenizeCommandBraces(firstCommand, lastCommand);
      
      // Process command content
      const newContext = {
        ...context,
        inCommand: true,
        interpolationAllowed: true,
        variableStyle: '@var' as const
      };
      
      // Add the first command part as keyword if it's the command name
      if (values.commandBases && values.commandBases.length > 0) {
        const cmdBase = values.commandBases[0];
        if (cmdBase.location) {
          this.tokenBuilder.addToken({
            line: cmdBase.location.start.line - 1,
            char: cmdBase.location.start.column - 1,
            length: cmdBase.command.length,
            tokenType: 'keyword',
            modifiers: []
          });
        }
      }
      
      // Process remaining parts (skip the command name which we already handled)
      let skipFirst = values.commandBases && values.commandBases.length > 0;
      for (const part of values.command) {
        if (skipFirst && part.content === values.commandBases[0].command) {
          skipFirst = false;
          continue;
        }
        this.mainVisitor.visitNode(part, newContext);
      }
    } else {
      this.visitChildren(values, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
    }
  }
  
  private visitOutputDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;
    if (!values) return;
    
    // Process source variable
    if (values.source?.identifier) {
      for (const identifier of values.source.identifier) {
        this.mainVisitor.visitNode(identifier, context);
      }
    }
    
    // Token for "to" keyword
    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
    const toMatch = directiveText.match(/\s+to\s+/);
    
    if (toMatch && toMatch.index !== undefined) {
      const toOffset = directive.location.start.offset + toMatch.index + toMatch[0].indexOf('to');
      const toPosition = this.document.positionAt(toOffset);
      
      this.tokenBuilder.addToken({
        line: toPosition.line,
        char: toPosition.character,
        length: 2,
        tokenType: 'keyword',
        modifiers: []
      });
    }
    
    // Process target
    if (values.target) {
      if (values.target.type === 'file' && values.target.path) {
        // File path - tokenize as string with proper interpolation handling
        if (values.target.meta?.quoted && values.target.path) {
          // For quoted paths, we need to handle interpolation
          // First, add opening quote token
          const firstPart = values.target.path[0];
          if (firstPart && firstPart.location) {
            this.tokenBuilder.addToken({
              line: firstPart.location.start.line - 1,
              char: firstPart.location.start.column - 2, // -2 for opening quote
              length: 1,
              tokenType: 'string',
              modifiers: []
            });
          }
          
          // Process each path part (text and variables)
          for (const pathPart of values.target.path) {
            if (pathPart.type === 'Text' && pathPart.location) {
              this.tokenBuilder.addToken({
                line: pathPart.location.start.line - 1,
                char: pathPart.location.start.column - 1,
                length: pathPart.content.length,
                tokenType: 'string',
                modifiers: []
              });
            } else if (pathPart.type === 'VariableReference') {
              this.mainVisitor.visitNode(pathPart, context);
            }
          }
          
          // Add closing quote token
          const lastPart = values.target.path[values.target.path.length - 1];
          if (lastPart && lastPart.location) {
            this.tokenBuilder.addToken({
              line: lastPart.location.end.line - 1,
              char: lastPart.location.end.column - 1,
              length: 1,
              tokenType: 'string',
              modifiers: []
            });
          }
        } else if (values.target.path) {
          // Unquoted path or variable reference
          for (const pathPart of values.target.path) {
            this.mainVisitor.visitNode(pathPart, context);
          }
        } else if (values.target.raw) {
          // Handle variable references in target (e.g., to @path)
          const targetVarMatch = directiveText.match(/\s+to\s+(@\w+)/);
          if (targetVarMatch && targetVarMatch.index !== undefined) {
            const varOffset = directive.location.start.offset + targetVarMatch.index + targetVarMatch[0].indexOf('@');
            const varPosition = this.document.positionAt(varOffset);
            const varName = targetVarMatch[1];
            
            this.tokenBuilder.addToken({
              line: varPosition.line,
              char: varPosition.character,
              length: varName.length,
              tokenType: 'variable',
              modifiers: []
            });
          }
        }
      } else if (values.target.type === 'stream' && values.target.stream) {
        // Find the position of stdout/stderr
        const streamMatch = directiveText.match(new RegExp(`\\s+(${values.target.stream})(?:\\s|$)`));
        if (streamMatch && streamMatch.index !== undefined) {
          const streamOffset = directive.location.start.offset + streamMatch.index + streamMatch[0].indexOf(values.target.stream);
          const streamPosition = this.document.positionAt(streamOffset);
          
          this.tokenBuilder.addToken({
            line: streamPosition.line,
            char: streamPosition.character,
            length: values.target.stream.length,
            tokenType: 'keyword',
            modifiers: []
          });
        }
      } else if (values.target.type === 'resolver' && values.target.raw) {
        // Handle variable references in target (e.g., to @path)
        const targetVarMatch = directiveText.match(/\s+to\s+(@\w+)/);
        if (targetVarMatch && targetVarMatch.index !== undefined) {
          const varOffset = directive.location.start.offset + targetVarMatch.index + targetVarMatch[0].indexOf('@');
          const varPosition = this.document.positionAt(varOffset);
          const varName = targetVarMatch[1];
          
          this.tokenBuilder.addToken({
            line: varPosition.line,
            char: varPosition.character,
            length: varName.length,
            tokenType: 'variable',
            modifiers: []
          });
        }
      }
    }
    
    // Handle format specifier ("as yaml", etc.)
    if (directive.meta?.format && directive.meta?.explicitFormat) {
      const asMatch = directiveText.match(/\s+as\s+(\w+)/);
      if (asMatch && asMatch.index !== undefined) {
        // Token for "as" keyword
        const asOffset = directive.location.start.offset + asMatch.index + asMatch[0].indexOf('as');
        const asPosition = this.document.positionAt(asOffset);
        
        this.tokenBuilder.addToken({
          line: asPosition.line,
          char: asPosition.character,
          length: 2,
          tokenType: 'keyword',
          modifiers: []
        });
        
        // Token for format name
        const formatOffset = directive.location.start.offset + asMatch.index + asMatch[0].lastIndexOf(asMatch[1]);
        const formatPosition = this.document.positionAt(formatOffset);
        
        this.tokenBuilder.addToken({
          line: formatPosition.line,
          char: formatPosition.character,
          length: asMatch[1].length,
          tokenType: 'keyword',
          modifiers: []
        });
      }
    }
  }
  
  private visitTemplateValue(directive: any, context: VisitorContext): void {
    const wrapperType = directive.meta?.wrapperType;
    // For /exe directives, use template array instead of value
    const values = directive.kind === 'exe' ? (directive.values?.template || []) : (directive.values?.value || []);
    
    
    let templateType: 'backtick' | 'doubleColon' | 'tripleColon' | null = null;
    let variableStyle: '@var' | '{{var}}' = '@var';
    let interpolationAllowed = true;
    let delimiterLength = 1;
    
    switch (wrapperType) {
      case 'backtick':
        templateType = 'backtick';
        delimiterLength = 1;
        break;
      case 'doubleColon':
        templateType = 'doubleColon';
        delimiterLength = 2;
        break;
      case 'tripleColon':
        templateType = 'tripleColon';
        variableStyle = '{{var}}';
        delimiterLength = 3;
        break;
      case 'singleQuote':
        interpolationAllowed = false;
        delimiterLength = 1;
        break;
      case 'doubleQuote':
        // Check if this is a simple string literal (no interpolation)
        if (values.length === 1 && values[0].type === 'Text') {
          // Simple string literal - tokenize as a single string
          if (values[0].location) {
            const startOffset = values[0].location.start.offset - 1; // Include opening quote
            const endOffset = values[0].location.end.offset + 1; // Include closing quote
            const source = this.document.getText();
            const stringContent = source.substring(startOffset, endOffset);
            
            this.tokenBuilder.addToken({
              line: directive.location.start.line - 1,
              char: values[0].location.start.column - 2, // -1 for 0-based, -1 for quote
              length: stringContent.length,
              tokenType: 'string',
              modifiers: []
            });
          }
          return; // Don't process as template
        }
        // Otherwise, it has interpolation
        templateType = 'string';
        interpolationAllowed = true;
        variableStyle = '@var';
        delimiterLength = 1;
        break;
    }
    
    if (templateType && values.length > 0) {
      const firstValue = values[0];
      const lastValue = values[values.length - 1];
      
      
      if (firstValue?.location) {
        // Calculate delimiter position more safely
        const sourceText = this.document.getText();
        const nodeText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
        
        // Find the actual delimiter position
        let delimiterChar = '';
        if (templateType === 'backtick') delimiterChar = '`';
        else if (templateType === 'doubleColon') delimiterChar = '::';
        else if (templateType === 'tripleColon') delimiterChar = ':::';
        
        if (delimiterChar && (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon')) {
          // Find the opening delimiter in the directive text
          const delimiterIndex = nodeText.lastIndexOf(delimiterChar, firstValue.location.start.offset - directive.location.start.offset);
          if (delimiterIndex !== -1) {
            const delimiterPosition = this.document.positionAt(directive.location.start.offset + delimiterIndex);
            this.tokenBuilder.addToken({
              line: delimiterPosition.line,
              char: delimiterPosition.character,
              length: delimiterLength,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
      
      const newContext = {
        ...context,
        templateType: templateType as any,
        interpolationAllowed,
        variableStyle,
        inSingleQuotes: wrapperType === 'singleQuote'
      };
      
      for (const node of values) {
        this.mainVisitor.visitNode(node, newContext);
      }
      
      if (lastValue?.location && (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon')) {
        // Find the closing delimiter
        const sourceText = this.document.getText();
        const nodeText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
        
        let delimiterChar = '';
        if (templateType === 'backtick') delimiterChar = '`';
        else if (templateType === 'doubleColon') delimiterChar = '::';
        else if (templateType === 'tripleColon') delimiterChar = ':::';
        
        if (delimiterChar) {
          // Find the closing delimiter after the last value
          const searchStart = lastValue.location.end.offset - directive.location.start.offset;
          const delimiterIndex = nodeText.indexOf(delimiterChar, searchStart);
          if (delimiterIndex !== -1) {
            const delimiterPosition = this.document.positionAt(directive.location.start.offset + delimiterIndex);
            this.tokenBuilder.addToken({
              line: delimiterPosition.line,
              char: delimiterPosition.character,
              length: delimiterLength,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
    }
  }
  
  private visitInlineCode(directive: any, context: VisitorContext): void {
    const values = directive.values;
    
    // Handle different code structures:
    // 1. /var with values.value[0].type === 'code'
    // 2. /exe with values.code and directive.raw.lang
    const codeNode = values.code || 
                    (Array.isArray(values.value) && values.value[0]?.type === 'code' ? values.value[0] : null);
    
    // Use the language helper for inline code tokenization
    this.languageHelper.tokenizeInlineCode(directive, codeNode);
  }
  
  private handlePrimitiveValue(value: any, directive: any): void {
    const source = this.document.getText();
    const directiveText = source.substring(directive.location.start.offset, directive.location.end.offset);
    const equalIndex = directiveText.indexOf('=');
    
    if (equalIndex === -1) return;
    
    const afterEqual = directiveText.substring(equalIndex + 1).trimStart();
    const valueStart = directive.location.start.column + equalIndex + 1 + (directiveText.length - equalIndex - 1 - afterEqual.length);
    
    let tokenType = 'string';
    let modifiers: string[] = [];
    let tokenLength = 0;
    
    if (typeof value === 'number') {
      tokenType = 'number';
      tokenLength = String(value).length;
    } else if (typeof value === 'boolean') {
      tokenType = 'boolean';
      tokenLength = String(value).length;
    } else if (value === null) {
      tokenType = 'null';
      tokenLength = 4;
    } else if (typeof value === 'string') {
      const quotedLength = afterEqual.indexOf(afterEqual[0], 1) + 1;
      tokenLength = quotedLength;
      
      if (afterEqual.startsWith("'")) {
        modifiers.push('literal');
      }
    }
    
    this.tokenBuilder.addToken({
      line: directive.location.start.line - 1,
      char: valueStart - 1,
      length: tokenLength,
      tokenType,
      modifiers
    });
  }
  
  private visitWhenDirective(node: any, context: VisitorContext): void {
    if (node.values) {
      // Handle simple when form: /when @condition => action
      if (node.values.condition && node.values.action) {
        // Process condition
        if (Array.isArray(node.values.condition)) {
          for (const cond of node.values.condition) {
            this.mainVisitor.visitNode(cond, context);
          }
        } else {
          this.mainVisitor.visitNode(node.values.condition, context);
        }
        
        // Find and add => operator
        const conditionEnd = Array.isArray(node.values.condition)
          ? node.values.condition[node.values.condition.length - 1].location?.end
          : node.values.condition.location?.end;
        const actionStart = Array.isArray(node.values.action)
          ? node.values.action[0].location?.start
          : node.values.action.location?.start;
          
        if (conditionEnd && actionStart) {
          this.operatorHelper.tokenizeOperatorBetween(
            conditionEnd.offset,
            actionStart.offset,
            '=>'
          );
        }
        
        // Process action
        if (Array.isArray(node.values.action)) {
          for (const action of node.values.action) {
            this.mainVisitor.visitNode(action, context);
          }
        } else {
          this.mainVisitor.visitNode(node.values.action, context);
        }
        return;
      }
      
      // Handle block form: /when @var: [...] or /when @var first: [...] or bare /when [...]
      if (node.values.conditions && Array.isArray(node.values.conditions)) {
        // Handle bare when form: /when [...] 
        if (!node.values.variable && !node.values.expression && !node.values.modifier) {
          // For bare form, find and tokenize the opening bracket after /when
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          
          // Find the opening bracket after /when
          const bracketMatch = nodeText.match(/^\/when\s*(\[)/);
          if (bracketMatch && bracketMatch.index !== undefined) {
            const bracketOffset = bracketMatch[0].indexOf('[');
            const bracketPosition = this.document.positionAt(node.location.start.offset + bracketOffset);
            
            this.tokenBuilder.addToken({
              line: bracketPosition.line,
              char: bracketPosition.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
        
        if (node.values.variable) {
          // The variable location is often wrong in the AST, so we need to find it manually
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          
          // Extract the variable identifier
          let varIdentifier = '';
          if (Array.isArray(node.values.variable) && node.values.variable[0]) {
            varIdentifier = node.values.variable[0].identifier || '';
          } else if (node.values.variable && node.values.variable.identifier) {
            varIdentifier = node.values.variable.identifier;
          }
          
          if (varIdentifier) {
            // Find the @ symbol followed by the identifier after /when
            const varPattern = new RegExp(`\\s+@${varIdentifier}(?=\\s|:|$)`);
            const match = nodeText.match(varPattern);
            
            if (match && match.index !== undefined) {
              const varOffset = match.index + match[0].indexOf('@');
              const varPosition = this.document.positionAt(node.location.start.offset + varOffset);
              
              // Add variable token
              this.tokenBuilder.addToken({
                line: varPosition.line,
                char: varPosition.character,
                length: varIdentifier.length + 1, // +1 for @
                tokenType: 'variable',
                modifiers: []
              });
            }
          }
        }
        
        // Handle expression in /when @var: pattern
        if (node.values.expression) {
          if (Array.isArray(node.values.expression)) {
            for (const expr of node.values.expression) {
              this.mainVisitor.visitNode(expr, context);
            }
          } else {
            this.mainVisitor.visitNode(node.values.expression, context);
          }
          
          // Add colon token after expression
          const sourceText = this.document.getText();
          const exprEnd = Array.isArray(node.values.expression) 
            ? node.values.expression[node.values.expression.length - 1].location?.end
            : node.values.expression.location?.end;
            
          if (exprEnd) {
            const afterExpr = sourceText.substring(exprEnd.offset, exprEnd.offset + 5);
            const colonIndex = afterExpr.indexOf(':');
            if (colonIndex !== -1) {
              this.tokenBuilder.addToken({
                line: exprEnd.line - 1,
                char: exprEnd.column - 1 + colonIndex,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
              
              // Look for opening bracket after colon
              const afterColon = afterExpr.substring(colonIndex + 1);
              const openBracketIndex = afterColon.search(/\[/);
              if (openBracketIndex !== -1) {
                this.tokenBuilder.addToken({
                  line: exprEnd.line - 1,
                  char: exprEnd.column - 1 + colonIndex + 1 + openBracketIndex,
                  length: 1,
                  tokenType: 'operator',
                  modifiers: []
                });
              }
            }
          }
        }
        
        // Handle pattern modifier (first:, all:, any:)
        if (node.values.modifier && Array.isArray(node.values.modifier) && node.values.modifier.length > 0) {
          const modifierText = node.values.modifier[0];
          if (process.env.DEBUG_LSP || this.document.uri.includes('test-syntax')) {
            console.log('[PATTERN-MOD] Found modifier:', modifierText);
          }
          if (modifierText.type === 'Text' && modifierText.content) {
            // Need to find the actual position of the modifier in the source text
            const sourceText = this.document.getText();
            const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
            
            // Find variable end position
            let searchStart = 0;
            // Since variable location is often wrong, find it manually
            const varMatch = nodeText.match(/\s+@\w+/);
            if (varMatch && varMatch.index !== undefined) {
              searchStart = varMatch.index + varMatch[0].length;
            } else {
              // If no variable, start after /when
              searchStart = 5; // length of "/when"
            }
            
            // Look for the modifier text followed by a colon
            const modifierPattern = new RegExp(`\\s+(${modifierText.content})\\s*:`);
            const match = nodeText.substring(searchStart).match(modifierPattern);
            
            if (match && match.index !== undefined) {
              const modifierOffset = searchStart + match.index + match[0].indexOf(modifierText.content);
              const modifierPosition = this.document.positionAt(node.location.start.offset + modifierOffset);
              
              this.tokenBuilder.addToken({
                line: modifierPosition.line,
                char: modifierPosition.character,
                length: modifierText.content.length,
                tokenType: 'keyword',
                modifiers: []
              });
              
              // Also add the colon after the modifier
              const colonOffset = modifierOffset + modifierText.content.length;
              const colonMatch = nodeText.substring(colonOffset).match(/^\s*:/);
              if (colonMatch) {
                const colonPosition = this.document.positionAt(node.location.start.offset + colonOffset + colonMatch.index! + colonMatch[0].indexOf(':'));
                this.tokenBuilder.addToken({
                  line: colonPosition.line,
                  char: colonPosition.character,
                  length: 1,
                  tokenType: 'operator',
                  modifiers: []
                });
                
                // Look for opening bracket after the pattern modifier's colon
                const afterColon = nodeText.substring(colonOffset + colonMatch[0].length);
                const openBracketMatch = afterColon.match(/^\s*\[/);
                if (openBracketMatch) {
                  const bracketOffset = colonOffset + colonMatch[0].length + openBracketMatch.index! + openBracketMatch[0].indexOf('[');
                  const bracketPosition = this.document.positionAt(node.location.start.offset + bracketOffset);
                  this.tokenBuilder.addToken({
                    line: bracketPosition.line,
                    char: bracketPosition.character,
                    length: 1,
                    tokenType: 'operator',
                    modifiers: []
                  });
                }
              }
            }
          }
        } else if (node.raw?.modifier || node.meta?.modifier) {
          // Fallback to raw/meta modifier if available
          const modifierText = node.raw?.modifier || node.meta?.modifier;
          if (process.env.DEBUG_LSP || this.document.uri.includes('test-syntax')) {
            console.log('[PATTERN-MOD] Using raw/meta modifier:', modifierText);
          }
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          
          // Find variable end position
          let searchStart = 0;
          // Since variable location is often wrong, find it manually
          const varMatch = nodeText.match(/\s+@\w+/);
          if (varMatch && varMatch.index !== undefined) {
            searchStart = varMatch.index + varMatch[0].length;
          } else {
            // If no variable, start after /when
            searchStart = 5; // length of "/when"
          }
          
          // Look for the modifier text followed by a colon
          const modifierPattern = new RegExp(`\\s+(${modifierText})\\s*:`);
          const match = nodeText.substring(searchStart).match(modifierPattern);
          
          if (match && match.index !== undefined) {
            const modifierOffset = searchStart + match.index + match[0].indexOf(modifierText);
            const modifierPosition = this.document.positionAt(node.location.start.offset + modifierOffset);
            
            this.tokenBuilder.addToken({
              line: modifierPosition.line,
              char: modifierPosition.character,
              length: modifierText.length,
              tokenType: 'keyword',
              modifiers: []
            });
            
            // Also add the colon after the modifier
            const colonOffset = modifierOffset + modifierText.length;
            const colonMatch = nodeText.substring(colonOffset).match(/^\s*:/);
            if (colonMatch) {
              const colonPosition = this.document.positionAt(node.location.start.offset + colonOffset + colonMatch.index! + colonMatch[0].indexOf(':'));
              this.tokenBuilder.addToken({
                line: colonPosition.line,
                char: colonPosition.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
              
              // Look for opening bracket after the pattern modifier's colon
              const afterColon = nodeText.substring(colonOffset + colonMatch[0].length);
              const openBracketMatch = afterColon.match(/^\s*\[/);
              if (openBracketMatch) {
                const bracketOffset = colonOffset + colonMatch[0].length + openBracketMatch.index! + openBracketMatch[0].indexOf('[');
                const bracketPosition = this.document.positionAt(node.location.start.offset + bracketOffset);
                this.tokenBuilder.addToken({
                  line: bracketPosition.line,
                  char: bracketPosition.character,
                  length: 1,
                  tokenType: 'operator',
                  modifiers: []
                });
              }
            }
          }
        } else {
          // For simple when blocks without pattern modifier, just add colon after variable
          if (node.values.variable && Array.isArray(node.values.variable) && node.values.variable[0]?.location) {
            const varEnd = node.values.variable[0].location.end;
            const sourceText = this.document.getText();
            const afterVar = sourceText.substring(varEnd.offset, varEnd.offset + 5);
            const colonIndex = afterVar.indexOf(':');
            if (colonIndex !== -1) {
              const colonPosition = this.document.positionAt(varEnd.offset + colonIndex);
              this.tokenBuilder.addToken({
                line: colonPosition.line,
                char: colonPosition.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }
        }
        
        // Note: Opening bracket is already handled in the expression/colon handling code above
        
        for (const pair of node.values.conditions) {
          if (pair.pattern && pair.patternLocation) {
            this.tokenBuilder.addToken({
              line: pair.patternLocation.start.line - 1,
              char: pair.patternLocation.start.column - 1,
              length: pair.pattern.length,
              tokenType: 'keyword',
              modifiers: []
            });
          }
          
          if (pair.condition) {
            if (Array.isArray(pair.condition)) {
              for (const cond of pair.condition) {
                this.mainVisitor.visitNode(cond, context);
              }
            } else {
              this.mainVisitor.visitNode(pair.condition, context);
            }
          }
          
          // Handle arrow operator
          if (pair.arrowLocation) {
            this.tokenBuilder.addToken({
              line: pair.arrowLocation.start.line - 1,
              char: pair.arrowLocation.start.column - 1,
              length: 2,
              tokenType: 'operator',
              modifiers: []
            });
          } else if (pair.condition && pair.action) {
            // For bare form without explicit arrowLocation, find => between condition and action
            const conditionEnd = Array.isArray(pair.condition)
              ? pair.condition[pair.condition.length - 1].location?.end
              : pair.condition.location?.end;
            const actionStart = Array.isArray(pair.action)
              ? pair.action[0].location?.start
              : pair.action.location?.start;
              
            if (conditionEnd && actionStart) {
              this.operatorHelper.tokenizeOperatorBetween(
                conditionEnd.offset,
                actionStart.offset,
                '=>'
              );
            }
          }
          
          if (pair.action) {
            if (Array.isArray(pair.action)) {
              for (const action of pair.action) {
                this.mainVisitor.visitNode(action, context);
              }
            } else {
              this.mainVisitor.visitNode(pair.action, context);
            }
          }
        }
        
        // Add closing bracket after processing all conditions
        if (node.values.conditions.length > 0 && node.location) {
          const sourceText = this.document.getText();
          const directiveText = sourceText.substring(
            node.location.start.offset,
            node.location.end.offset
          );
          const closeBracketIndex = directiveText.lastIndexOf(']');
          if (closeBracketIndex !== -1) {
            // Calculate absolute position of the closing bracket
            const absolutePosition = this.document.positionAt(node.location.start.offset + closeBracketIndex);
            this.tokenBuilder.addToken({
              line: absolutePosition.line,
              char: absolutePosition.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
        
        // Handle action for when blocks (after ] =>)
        if (node.values.action) {
          // Find and tokenize => operator
          const sourceText = this.document.getText();
          const directiveText = sourceText.substring(
            node.location.start.offset,
            node.location.end.offset
          );
          const closeBracketIndex = directiveText.lastIndexOf(']');
          if (closeBracketIndex !== -1) {
            const afterBracket = directiveText.substring(closeBracketIndex + 1);
            const arrowIndex = afterBracket.indexOf('=>');
            if (arrowIndex !== -1) {
              const arrowPosition = this.document.positionAt(
                node.location.start.offset + closeBracketIndex + 1 + arrowIndex
              );
              this.tokenBuilder.addToken({
                line: arrowPosition.line,
                char: arrowPosition.character,
                length: 2,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }
          
          // Process the action
          if (Array.isArray(node.values.action)) {
            for (const action of node.values.action) {
              this.mainVisitor.visitNode(action, context);
            }
          } else {
            this.mainVisitor.visitNode(node.values.action, context);
          }
        }
      } else if (node.values.condition) {
        if (Array.isArray(node.values.condition)) {
          for (const cond of node.values.condition) {
            this.mainVisitor.visitNode(cond, context);
          }
        } else {
          this.mainVisitor.visitNode(node.values.condition, context);
        }
        
        if (node.values.action) {
          const conditionEnd = Array.isArray(node.values.condition) 
            ? node.values.condition[node.values.condition.length - 1].location?.end 
            : node.values.condition.location?.end;
          const actionStart = Array.isArray(node.values.action)
            ? node.values.action[0].location?.start
            : node.values.action.location?.start;
            
          if (conditionEnd && actionStart) {
            // Find the arrow operator between condition and action
            this.operatorHelper.tokenizeOperatorBetween(
              conditionEnd.offset,
              actionStart.offset,
              '=>'
            );
          }
        }
        
        if (node.values.action) {
          if (Array.isArray(node.values.action)) {
            // Handle block delimiters for array actions
            const sourceText = this.document.getText();
            const directiveText = sourceText.substring(
              node.location.start.offset,
              node.location.end.offset
            );
            
            // Find opening bracket
            const arrowIndex = directiveText.indexOf('=>');
            if (arrowIndex !== -1) {
              const afterArrow = directiveText.substring(arrowIndex + 2);
              const openBracketIndex = afterArrow.search(/\[/);
              
              if (openBracketIndex !== -1) {
                // Add opening bracket token
                this.tokenBuilder.addToken({
                  line: node.location.start.line - 1,
                  char: node.location.start.column + arrowIndex + 2 + openBracketIndex - 1,
                  length: 1,
                  tokenType: 'operator',
                  modifiers: []
                });
              }
            }
            
            // Visit each action
            for (const action of node.values.action) {
              this.mainVisitor.visitNode(action, context);
            }
            
            // Find closing bracket position
            const closeBracketIndex = directiveText.lastIndexOf(']');
            if (closeBracketIndex !== -1) {
              // Calculate the actual line and column for the closing bracket
              const linesBeforeBracket = directiveText.substring(0, closeBracketIndex).split('\n');
              const bracketLine = node.location.start.line + linesBeforeBracket.length - 2;
              const bracketColumn = linesBeforeBracket.length > 1 
                ? linesBeforeBracket[linesBeforeBracket.length - 1].length
                : node.location.start.column + closeBracketIndex - 1;
              
              this.tokenBuilder.addToken({
                line: bracketLine,
                char: bracketColumn,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          } else {
            this.mainVisitor.visitNode(node.values.action, context);
          }
        }
      }
    }
  }
  
  private visitImportDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;
    if (!values || !directive.location) return;
    
    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
    
    // Handle import items (selected imports)
    if (values.imports && Array.isArray(values.imports)) {
      // Find and tokenize opening brace
      const openBraceMatch = directiveText.match(/^\s*\/import\s*(\{)/);
      if (openBraceMatch && openBraceMatch.index !== undefined) {
        const braceOffset = directive.location.start.offset + openBraceMatch[0].indexOf('{');
        const bracePosition = this.document.positionAt(braceOffset);
        
        this.tokenBuilder.addToken({
          line: bracePosition.line,
          char: bracePosition.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
      
      // Tokenize each import item
      for (let i = 0; i < values.imports.length; i++) {
        const importItem = values.imports[i];
        if (importItem?.identifier && importItem?.location) {
          this.tokenBuilder.addToken({
            line: importItem.location.start.line - 1,
            char: importItem.location.start.column - 1,
            length: importItem.identifier.length || 0,
            tokenType: 'variable',
            modifiers: []
          });
        }
        
        // Tokenize comma between items
        if (i < values.imports.length - 1 && importItem?.location && values.imports[i + 1]?.location) {
          const nextItem = values.imports[i + 1];
          const afterItem = sourceText.substring(importItem.location.end.offset, nextItem.location.start.offset);
          const commaIndex = afterItem.indexOf(',');
          if (commaIndex !== -1) {
            const commaOffset = importItem.location.end.offset + commaIndex;
            const commaPosition = this.document.positionAt(commaOffset);
            
            this.tokenBuilder.addToken({
              line: commaPosition.line,
              char: commaPosition.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
      
      // Find and tokenize closing brace
      const closeBraceMatch = directiveText.match(/\}/);
      if (closeBraceMatch && closeBraceMatch.index !== undefined) {
        const closeBraceOffset = directive.location.start.offset + closeBraceMatch.index;
        const closeBracePosition = this.document.positionAt(closeBraceOffset);
        
        this.tokenBuilder.addToken({
          line: closeBracePosition.line,
          char: closeBracePosition.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
    }
    
    // Tokenize "from" keyword
    const fromMatch = directiveText.match(/\s+from\s+/);
    if (fromMatch && fromMatch.index !== undefined) {
      const fromOffset = directive.location.start.offset + fromMatch.index + fromMatch[0].indexOf('from');
      const fromPosition = this.document.positionAt(fromOffset);
      
      this.tokenBuilder.addToken({
        line: fromPosition.line,
        char: fromPosition.character,
        length: 4,
        tokenType: 'keyword',
        modifiers: []
      });
    }
    
    // Handle import source (path or namespace)
    if (values.path && Array.isArray(values.path) && values.path.length > 0) {
      const pathNode = values.path[0];
      
      if (directive.meta?.path?.isModule) {
        // Module import like @mlld/github or @corp/utils
        // Parse the module path to handle multi-segment paths
        const fullPath = pathNode?.content || '';
        const parts = fullPath.split('/');
        
        if (process.env.DEBUG_LSP === 'true') {
          console.log('[IMPORT-MODULE]', {
            fullPath,
            parts,
            directiveText,
            pathNode: pathNode?.content
          });
        }
        
        if (parts.length >= 2 && parts[0].startsWith('@')) {
          // Find the start position of the module path
          const moduleStartMatch = directiveText.indexOf(fullPath);
          if (moduleStartMatch !== -1) {
            const moduleStartOffset = directive.location.start.offset + moduleStartMatch;
            const moduleStartPosition = this.document.positionAt(moduleStartOffset);
            
            if (process.env.DEBUG_LSP === 'true') {
              console.log('[IMPORT-TOKEN-MODULE]', {
                line: moduleStartPosition.line,
                char: moduleStartPosition.character,
                length: fullPath.length,
                fullPath
              });
            }
            
            // Try highlighting the entire module path as one token
            // This might work better for visibility
            this.tokenBuilder.addToken({
              line: moduleStartPosition.line,
              char: moduleStartPosition.character,
              length: fullPath.length,
              tokenType: 'variable',
              modifiers: ['defaultLibrary']
            });
          }
        }
      } else if (pathNode?.content === '@input') {
        // Special @input source
        const inputMatch = directiveText.match(/@input/);
        if (inputMatch && inputMatch.index !== undefined) {
          const inputOffset = directive.location.start.offset + inputMatch.index;
          const inputPosition = this.document.positionAt(inputOffset);
          
          this.tokenBuilder.addToken({
            line: inputPosition.line,
            char: inputPosition.character,
            length: 6, // @input
            tokenType: 'keyword',
            modifiers: []
          });
        }
      } else {
        // File path string
        // Check if this is a simple string or contains variables
        const hasVariables = values.path.some(node => 
          node.type === 'VariableReference' && node.valueType === 'varIdentifier'
        );
        
        if (hasVariables) {
          // Complex path with variables like "@base/something.mld"
          // First, find the opening quote
          const quoteMatch = directiveText.match(/from\s+("[^"]*")/);
          if (quoteMatch && quoteMatch.index !== undefined) {
            const quoteOffset = directive.location.start.offset + quoteMatch.index + quoteMatch[0].indexOf('"');
            const quotePosition = this.document.positionAt(quoteOffset);
            
            // Token for opening quote
            this.tokenBuilder.addToken({
              line: quotePosition.line,
              char: quotePosition.character,
              length: 1,
              tokenType: 'string',
              modifiers: []
            });
            
            // Process each path node
            for (let i = 0; i < values.path.length; i++) {
              const node = values.path[i];
              if (node.type === 'VariableReference' && node.valueType === 'varIdentifier') {
                // Variable within the string like @base
                this.tokenBuilder.addToken({
                  line: node.location.start.line - 1,
                  char: node.location.start.column - 1,
                  length: node.identifier.length + 1, // +1 for @
                  tokenType: 'variable',
                  modifiers: []
                });
              } else if (node.type === 'Text' && node.location) {
                // Text content within the string
                this.tokenBuilder.addToken({
                  line: node.location.start.line - 1,
                  char: node.location.start.column - 1,
                  length: node.content.length,
                  tokenType: 'string',
                  modifiers: []
                });
              }
            }
            
            // Token for closing quote
            const closingQuoteMatch = directiveText.match(/from\s+"[^"]*"/);
            if (closingQuoteMatch) {
              const fullMatch = closingQuoteMatch[0];
              const closingQuoteOffset = directive.location.start.offset + directiveText.indexOf(fullMatch) + fullMatch.length - 1;
              const closingQuotePosition = this.document.positionAt(closingQuoteOffset);
              
              this.tokenBuilder.addToken({
                line: closingQuotePosition.line,
                char: closingQuotePosition.character,
                length: 1,
                tokenType: 'string',
                modifiers: []
              });
            }
          }
        } else {
          // Simple string path like "shared.mld" - tokenize as one unit
          const stringMatch = directiveText.match(/from\s+("[^"]*")/);
          if (stringMatch && stringMatch.index !== undefined) {
            const stringOffset = directive.location.start.offset + stringMatch.index + stringMatch[0].indexOf('"');
            const stringPosition = this.document.positionAt(stringOffset);
            
            this.tokenBuilder.addToken({
              line: stringPosition.line,
              char: stringPosition.character,
              length: stringMatch[1].length, // includes both quotes
              tokenType: 'string',
              modifiers: []
            });
          }
        }
      }
    }
    
    // Handle "as" alias
    if (directive.subtype === 'importNamespace' && values.namespace) {
      const asMatch = directiveText.match(/\s+as\s+(\w+)/);
      if (asMatch && asMatch.index !== undefined && asMatch[1]) {
        // Token for "as" keyword
        const asOffset = directive.location.start.offset + asMatch.index + asMatch[0].indexOf('as');
        const asPosition = this.document.positionAt(asOffset);
        
        this.tokenBuilder.addToken({
          line: asPosition.line,
          char: asPosition.character,
          length: 2,
          tokenType: 'keyword',
          modifiers: []
        });
        
        // Token for alias name
        const aliasOffset = directive.location.start.offset + asMatch.index + asMatch[0].lastIndexOf(asMatch[1]);
        const aliasPosition = this.document.positionAt(aliasOffset);
        
        this.tokenBuilder.addToken({
          line: aliasPosition.line,
          char: aliasPosition.character,
          length: asMatch[1]?.length || 0,
          tokenType: 'variable',
          modifiers: []
        });
      }
    }
  }
  
  private visitForDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;
    if (!values || !directive.location) return;
    
    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
    
    // Process variable
    if (values.variable && Array.isArray(values.variable)) {
      for (const varNode of values.variable) {
        this.mainVisitor.visitNode(varNode, context);
      }
    }
    
    // Find and tokenize "in" keyword
    const inMatch = directiveText.match(/\s+in\s+/);
    if (inMatch && inMatch.index !== undefined) {
      const inOffset = directive.location.start.offset + inMatch.index + inMatch[0].indexOf('in');
      const inPosition = this.document.positionAt(inOffset);
      
      this.tokenBuilder.addToken({
        line: inPosition.line,
        char: inPosition.character,
        length: 2,
        tokenType: 'keyword',
        modifiers: []
      });
    }
    
    // Process source collection
    if (values.source && Array.isArray(values.source)) {
      for (const sourceNode of values.source) {
        this.mainVisitor.visitNode(sourceNode, context);
      }
    }
    
    // Find and tokenize "=>" operator
    const arrowMatch = directiveText.match(/\s+=>\s+/);
    if (arrowMatch && arrowMatch.index !== undefined) {
      const arrowOffset = directive.location.start.offset + arrowMatch.index + arrowMatch[0].indexOf('=>');
      const arrowPosition = this.document.positionAt(arrowOffset);
      
      this.tokenBuilder.addToken({
        line: arrowPosition.line,
        char: arrowPosition.character,
        length: 2,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    // Process action
    if (values.action && Array.isArray(values.action)) {
      for (const actionNode of values.action) {
        // Special handling for output directives to ensure proper tokenization
        if (actionNode.type === 'Directive' && actionNode.kind === 'output') {
          // For output directives, ensure they are processed with full tokenization
          this.visitOutputDirective(actionNode, context);
        } else {
          this.mainVisitor.visitNode(actionNode, context);
        }
      }
    }
  }
}