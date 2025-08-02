import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { LocationHelpers } from '@services/lsp/utils/LocationHelpers';
import { TextExtractor } from '@services/lsp/utils/TextExtractor';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';
import { CommentTokenHelper } from '@services/lsp/utils/CommentTokenHelper';
import { embeddedLanguageService } from '@services/lsp/embedded/EmbeddedLanguageService';

export class DirectiveVisitor extends BaseVisitor {
  private mainVisitor: any;
  private operatorHelper: OperatorTokenHelper;
  private commentHelper: CommentTokenHelper;
  
  constructor(document: any, tokenBuilder: any) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
    this.commentHelper = new CommentTokenHelper(document, tokenBuilder);
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
    if (!node.meta?.implicit) {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: node.kind.length + 1,
        tokenType: 'directive',
        modifiers: []
      });
    }
    
    if (node.kind === 'when') {
      this.visitWhenDirective(node, context);
      return;
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
          const baseOffset = node.location.start.offset + identifierStart + identifierName.length;
          
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
              10,
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
    if (directive.kind === 'show' && values.content && directive.meta?.wrapperType) {
      const tempDirective = { ...directive, values: { ...values, value: values.content } };
      this.visitTemplateValue(tempDirective, context);
      return;
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
      
      // For language-specific code blocks, extract from source text
      if (values.code && directive.location) {
        const sourceText = this.document.getText();
        const directiveText = sourceText.substring(
          directive.location.start.offset,
          directive.location.end.offset
        );
        
        // Find language identifier (e.g., 'js', 'python', etc.)
        const langMatch = directiveText.match(/\s+(js|javascript|python|py|sh|bash|node)\s*\{/);
        if (langMatch) {
          const langText = langMatch[1];
          const langIndex = langMatch.index! + langMatch[0].indexOf(langText);
          
          // Add language identifier token
          const langPosition = this.document.positionAt(directive.location.start.offset + langIndex);
          this.tokenBuilder.addToken({
            line: langPosition.line,
            char: langPosition.character,
            length: langText.length,
            tokenType: 'embedded',
            modifiers: []
          });
        }
        
        // Find the opening brace position
        const braceIndex = directiveText.indexOf('{');
        if (braceIndex !== -1) {
          // Add opening brace token
          this.operatorHelper.addOperatorToken(
            directive.location.start.offset + braceIndex,
            1
          );
          
          // Find closing brace position
          const closeBraceIndex = directiveText.lastIndexOf('}');
          if (closeBraceIndex !== -1 && closeBraceIndex > braceIndex) {
            // Extract code content between braces
            const codeContent = directiveText.substring(braceIndex + 1, closeBraceIndex);
            
            // Find the actual content bounds (trim whitespace for display)
            let contentStart = 0;
            let contentEnd = codeContent.length;
            
            // Find first non-whitespace
            while (contentStart < codeContent.length && /\s/.test(codeContent[contentStart])) {
              if (codeContent[contentStart] === '\n') {
                contentStart++;
                break; // Stop after first newline
              }
              contentStart++;
            }
            
            // Find last non-whitespace
            while (contentEnd > contentStart && /\s/.test(codeContent[contentEnd - 1])) {
              if (codeContent[contentEnd - 1] === '\n') {
                // Include content up to the last newline
                contentEnd--;
                break;
              }
              contentEnd--;
            }
            
            // Use embedded language service for syntax highlighting
            if (langMatch && langMatch[1] && contentEnd > contentStart) {
              const language = langMatch[1];
              const actualCode = codeContent.substring(contentStart, contentEnd);
              
              // Check if embedded language service is initialized and supports this language
              if (embeddedLanguageService.isLanguageSupported(language)) {
                try {
                  // Calculate the starting position of the code content
                  const codePosition = this.document.positionAt(directive.location.start.offset + braceIndex + 1 + contentStart);
                  
                  // Generate semantic tokens for the embedded code
                  const embeddedTokens = embeddedLanguageService.generateTokens(
                    actualCode,
                    language,
                    codePosition.line,
                    codePosition.character
                  );
                  
                  // Add all embedded language tokens
                  for (const token of embeddedTokens) {
                    this.tokenBuilder.addToken(token);
                  }
                } catch (error) {
                  console.error(`Failed to tokenize embedded ${language} code:`, error);
                  // No fallback - if tree-sitter fails, we want to know about it and fix it
                }
              }
              // If language not supported, no tokens - this is intentional
            }
            
            // Add closing brace token
            this.operatorHelper.addOperatorToken(
              directive.location.start.offset + closeBraceIndex,
              1
            );
          }
        }
      }
    } else {
      // Regular command with braces
      if (values.command && Array.isArray(values.command) && values.command.length > 0) {
        const firstCommand = values.command[0];
        const lastCommand = values.command[values.command.length - 1];
        
        // Add opening brace
        if (firstCommand.location) {
          this.operatorHelper.addOperatorToken(
            firstCommand.location.start.offset - 1, // Brace is before command
            1
          );
        }
        
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
        
        // Add closing brace
        if (lastCommand.location) {
          this.operatorHelper.addOperatorToken(
            lastCommand.location.end.offset,
            1
          );
        }
      } else {
        this.visitChildren(values, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
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
      
      if (firstValue.location) {
        const openDelimiterStart = firstValue.location.start.column - delimiterLength - 1;
        
        if (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon' || templateType === 'string') {
          this.tokenBuilder.addToken({
            line: firstValue.location.start.line - 1,
            char: openDelimiterStart,
            length: delimiterLength,
            tokenType: templateType === 'string' ? 'string' : 'template',
            modifiers: []
          });
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
      
      if (lastValue.location && (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon' || templateType === 'string')) {
        const closeDelimiterStart = lastValue.location.end.column;
        
        this.tokenBuilder.addToken({
          line: lastValue.location.end.line - 1,
          char: closeDelimiterStart,
          length: delimiterLength,
          tokenType: templateType === 'string' ? 'string' : 'template',
          modifiers: []
        });
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
    
    if (!directive.location) return;
    
    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(
      directive.location.start.offset,
      directive.location.end.offset
    );
    
    // Get language and code content based on directive type
    let language: string | undefined;
    let codeContent: string | undefined;
    
    if (directive.kind === 'exe' && directive.raw) {
      // For /exe directives
      language = directive.raw.lang;
      codeContent = directive.raw.code;
    } else if (codeNode) {
      // For /var directives with code nodes
      language = codeNode.lang || codeNode.language;
      codeContent = codeNode.code;
    }
    
    if (!language || !codeContent) {
      return;
    }
    
    // Find language identifier and opening brace in the source text
    const langBraceMatch = directiveText.match(new RegExp(`=\\s*(${language})\\s*\\{`));
    if (!langBraceMatch) {
      return;
    }
    
    const langStart = directiveText.indexOf(langBraceMatch[0]) + langBraceMatch[0].indexOf(language);
    
    // Add language identifier token (using 'label' type as per TOKEN_TYPE_MAP)
    this.tokenBuilder.addToken({
      line: directive.location.start.line - 1,
      char: directive.location.start.column - 1 + langStart,
      length: language.length,
      tokenType: 'label',
      modifiers: []
    });
    
    // Find the opening brace position
    const braceIndex = directiveText.indexOf('{', langStart);
    if (braceIndex === -1) return;
    
    // Add opening brace token
    this.operatorHelper.addOperatorToken(
      directive.location.start.offset + braceIndex,
      1
    );
    
    // Find closing brace position
    const closeBraceIndex = directiveText.lastIndexOf('}');
    if (closeBraceIndex !== -1 && closeBraceIndex > braceIndex) {
      // Use code content from directive
      const trimmedCode = codeContent.trim();
      
      // Calculate where the code starts in the source
      const codeStartIndex = directiveText.indexOf(trimmedCode, braceIndex + 1);
      
      if (trimmedCode && embeddedLanguageService && 
          embeddedLanguageService.isLanguageSupported(language)) {
        try {
          // Calculate the starting position of the actual code
          const codePosition = this.document.positionAt(
            directive.location.start.offset + codeStartIndex
          );
          
          
          // Generate semantic tokens for the embedded code
          const embeddedTokens = embeddedLanguageService.generateTokens(
            trimmedCode,
            language,
            codePosition.line,
            codePosition.character
          );
          
          
          // Add all embedded language tokens
          for (const token of embeddedTokens) {
            this.tokenBuilder.addToken(token);
          }
        } catch (error) {
          console.error(`Failed to tokenize inline ${language} code:`, error);
        }
      } else {
      }
      
      // Add closing brace token
      this.operatorHelper.addOperatorToken(
        directive.location.start.offset + closeBraceIndex,
        1
      );
    }
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
      
      // Handle block form: /when @var: [...] or /when @var first: [...]
      if (node.values.conditions && Array.isArray(node.values.conditions)) {
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
}