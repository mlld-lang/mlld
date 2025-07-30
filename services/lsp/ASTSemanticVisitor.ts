/**
 * AST Semantic Visitor for mlld Language Server
 * 
 * This visitor traverses the mlld AST and generates semantic tokens
 * with proper context awareness for template types, interpolation rules,
 * and embedded languages.
 */

import { SemanticTokensBuilder } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Import node types from generated grammar
import { NodeType } from '@grammar/generated/parser/grammar-core';
import { HIGHLIGHTING_RULES, shouldInterpolate, isXMLTag } from '@core/highlighting/rules';

export interface VisitorContext {
  templateType?: 'backtick' | 'doubleColon' | 'tripleColon' | null;
  inCommand?: boolean;
  commandLanguage?: string;
  interpolationAllowed?: boolean;
  variableStyle?: '@var' | '{{var}}';
  inSingleQuotes?: boolean;
}

export interface TokenInfo {
  line: number;
  char: number;
  length: number;
  tokenType: string;
  modifiers: string[];
  data?: any; // For additional metadata like language injection hints
}

export class ASTSemanticVisitor {
  private contextStack: VisitorContext[] = [{}];
  private tokenTypes: string[];
  private tokenModifiers: string[];
  
  constructor(
    private document: TextDocument,
    private builder: SemanticTokensBuilder,
    tokenTypes: string[],
    tokenModifiers: string[]
  ) {
    this.tokenTypes = tokenTypes;
    this.tokenModifiers = tokenModifiers;
  }
  
  get currentContext(): VisitorContext {
    return this.contextStack[this.contextStack.length - 1];
  }
  
  pushContext(context: Partial<VisitorContext>) {
    this.contextStack.push({
      ...this.currentContext,
      ...context
    });
  }
  
  popContext() {
    this.contextStack.pop();
  }
  
  visitAST(ast: any[]): void {
    for (const node of ast) {
      this.visitNode(node);
    }
  }
  
  visitNode(node: any): void {
    if (!node || !node.type) return;
    
    // Log missing locations for debugging
    if (!node.location && node.type !== 'Text' && node.type !== 'Newline') {
      console.warn(`Node type ${node.type} missing location`);
    }
    
    switch (node.type) {
      case 'Directive':
        this.visitDirective(node);
        break;
        
      case 'VariableReference':
        this.visitVariableReference(node);
        break;
        
      case 'Comment':
        this.visitComment(node);
        break;
        
      case 'StringLiteral':
        this.visitStringLiteral(node);
        break;
        
      case 'CommandBase':
        this.visitCommand(node);
        break;
        
      case 'FileReference':
        this.visitFileReference(node);
        break;
        
      case 'load-content':
        this.visitLoadContent(node);
        break;
        
      case 'BinaryExpression':
      case 'UnaryExpression':
        this.visitOperator(node);
        break;
        
      case 'TernaryExpression':
        this.visitTernaryExpression(node);
        break;
        
      case 'Literal':
        this.visitLiteral(node);
        break;
        
      case 'Text':
        this.visitText(node);
        break;
        
      case 'WhenExpression':
        this.visitWhenExpression(node);
        break;
        
      case 'ExecInvocation':
        this.visitExecInvocation(node);
        break;
        
      case 'CommandReference':
        this.visitCommandReference(node);
        break;
        
      case 'Parameter':
        this.visitParameter(node);
        break;
        
      case 'PathSeparator':
        this.visitPathSeparator(node);
        break;
        
      case 'DotSeparator':
        this.visitDotSeparator(node);
        break;
        
      case 'SectionMarker':
        this.visitSectionMarker(node);
        break;
        
      case 'Frontmatter':
        this.visitFrontmatter(node);
        break;
        
      case 'CodeFence':
        this.visitCodeFence(node);
        break;
        
      case 'MlldRunBlock':
        this.visitMlldRunBlock(node);
        break;
        
      case 'Newline':
        // Skip newlines for semantic tokens
        break;
        
      case 'Error':
        this.visitError(node);
        break;
        
      default:
        // Unknown node type - still visit children
        console.warn(`Unknown node type: ${node.type}`);
        this.visitChildren(node);
    }
  }
  
  visitChildren(node: any): void {
    // Check various possible child properties
    const childProps = ['values', 'children', 'body', 'content', 'nodes', 'elements'];
    
    for (const prop of childProps) {
      if (node[prop]) {
        if (Array.isArray(node[prop])) {
          for (const child of node[prop]) {
            this.visitNode(child);
          }
        } else if (typeof node[prop] === 'object') {
          this.visitNode(node[prop]);
        }
      }
    }
  }
  
  visitDirective(node: any): void {
    if (!node.location) return;
    
    // Highlight the directive keyword (e.g., /var, /show)
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.kind.length + 1, // +1 for the / character
      tokenType: 'directive',
      modifiers: []
    });
    
    // Special handling for when directives
    if (node.kind === 'when') {
      this.visitWhenDirective(node);
      return;
    }
    
    // Handle variable declarations
    if ((node.kind === 'var' || node.kind === 'exe' || node.kind === 'path') && 
        node.values?.identifier) {
      const identifierNodes = node.values.identifier;
      if (Array.isArray(identifierNodes) && identifierNodes.length > 0) {
        const firstIdentifier = identifierNodes[0];
        const identifierName = firstIdentifier.identifier || '';
        
        if (identifierName) {
          // Calculate the actual position of the identifier
          // It should be after "/var @" which is directive length + 2
          const identifierStart = node.location.start.column + node.kind.length + 2; // +1 for /, +1 for space, @ is part of identifier display
          
          this.addToken({
            line: node.location.start.line - 1,
            char: identifierStart - 1,
            length: identifierName.length + 1, // +1 for @
            tokenType: 'variable',
            modifiers: ['declaration']
          });
        }
      }
      
      // For /exe directives, also visit parameters
      if (node.kind === 'exe' && node.values?.params) {
        for (const param of node.values.params) {
          this.visitNode(param);
        }
      }
    }
    
    // Process directive values with appropriate context
    if (node.values) {
      this.visitDirectiveValues(node);
    }
  }
  
  visitDirectiveValues(directive: any): void {
    const values = directive.values;
    
    // Special handling for /run directives
    if (directive.kind === 'run') {
      this.visitRunDirective(directive);
      return;
    }
    
    // Handle based on the directive kind and meta info
    if (directive.kind === 'exe' && values.template) {
      // Handle /exe template content specially
      this.pushContext({
        templateType: 'backtick',
        interpolationAllowed: true,
        variableStyle: '@var'
      });
      
      for (const node of values.template) {
        this.visitNode(node);
      }
      
      this.popContext();
    } else if (directive.meta?.wrapperType) {
      // This is a template-like value (for other directives)
      this.visitTemplateValue(directive);
    } else if (values.variable) {
      // Handle /show @var directives
      if (Array.isArray(values.variable)) {
        for (const varRef of values.variable) {
          this.visitNode(varRef);
        }
      } else {
        this.visitNode(values.variable);
      }
    } else if (values.command) {
      this.visitCommand(values.command);
    } else if (values.expression) {
      this.visitExpression(values.expression);
    } else if (values.value && Array.isArray(values.value)) {
      // Visit the value array content
      for (const node of values.value) {
        if (typeof node === 'object' && node !== null) {
          this.visitNode(node);
        } else if (directive.location) {
          // Handle primitive values (numbers, booleans, null)
          this.handlePrimitiveValue(node, directive);
        }
      }
    } else if (values.value !== undefined && directive.location) {
      // Single primitive value
      this.handlePrimitiveValue(values.value, directive);
    }
    
    // Visit other child nodes
    this.visitChildren(values);
  }
  
  visitRunDirective(directive: any): void {
    const values = directive.values;
    
    // Check for language-specific run commands
    if (values?.lang) {
      // Highlight the language identifier
      const langText = this.extractText(Array.isArray(values.lang) ? values.lang : [values.lang]);
      if (langText && directive.location) {
        // Calculate position after "/run "
        const langStart = directive.location.start.column + 4; // "/run" + space
        
        this.addToken({
          line: directive.location.start.line - 1,
          char: langStart,
          length: langText.length,
          tokenType: 'embedded',
          modifiers: []
        });
      }
      
      // Mark code content for embedded highlighting
      if (values.code && Array.isArray(values.code)) {
        for (const codeNode of values.code) {
          if (codeNode.location && codeNode.content) {
            // Find the actual code content (between braces)
            const codeContent = codeNode.content;
            const codeStart = codeNode.location.start.column + langText.length + 2; // After "python {"
            
            this.addToken({
              line: codeNode.location.start.line - 1,
              char: codeStart,
              length: codeContent.length,
              tokenType: 'embeddedCode',
              modifiers: [],
              data: { language: langText }
            });
          }
        }
      }
    } else {
      // Regular command - visit normally
      this.visitChildren(values);
    }
  }
  
  visitTemplateValue(directive: any): void {
    const wrapperType = directive.meta?.wrapperType;
    const values = directive.values?.value || [];
    
    // Determine template context from wrapperType
    let templateType: 'backtick' | 'doubleColon' | 'tripleColon' | 'doubleQuote' | 'singleQuote' | null = null;
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
      case 'doubleQuote':
        templateType = 'doubleQuote';
        delimiterLength = 1;
        break;
      case 'singleQuote':
        templateType = 'singleQuote';
        interpolationAllowed = false;
        delimiterLength = 1;
        break;
    }
    
    if (templateType && values.length > 0) {
      // Calculate delimiter positions based on content
      const firstValue = values[0];
      const lastValue = values[values.length - 1];
      
      if (firstValue.location) {
        // Opening delimiter should be just before the first content
        const openDelimiterStart = firstValue.location.start.column - delimiterLength - 1;
        
        // Add opening delimiter token for templates (not quotes)
        if (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon') {
          this.addToken({
            line: firstValue.location.start.line - 1,
            char: openDelimiterStart,
            length: delimiterLength,
            tokenType: 'template',
            modifiers: []
          });
        }
      }
      
      // Process template content with proper context
      this.pushContext({
        templateType: templateType as any,
        interpolationAllowed,
        variableStyle,
        inSingleQuotes: templateType === 'singleQuote'
      });
      
      // Visit the value nodes
      for (const node of values) {
        this.visitNode(node);
      }
      
      this.popContext();
      
      // Add closing delimiter token
      if (lastValue.location && (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon')) {
        const closeDelimiterStart = lastValue.location.end.column;
        
        this.addToken({
          line: lastValue.location.end.line - 1,
          char: closeDelimiterStart,
          length: delimiterLength,
          tokenType: 'template',
          modifiers: []
        });
      }
    }
  }
  
  visitTemplate(node: any): void {
    if (!node.location) return;
    
    // Use AST properties to determine template type
    let templateType: 'backtick' | 'doubleColon' | 'tripleColon' | null = null;
    let variableStyle: '@var' | '{{var}}' = '@var';
    let delimiterLength = 1;
    
    // Check node properties or delimiter info
    if (node.delimiter) {
      switch (node.delimiter) {
        case '`':
          templateType = 'backtick';
          delimiterLength = 1;
          break;
        case '::':
          templateType = 'doubleColon';
          delimiterLength = 2;
          break;
        case ':::':
          templateType = 'tripleColon';
          variableStyle = '{{var}}';
          delimiterLength = 3;
          break;
      }
    } else if (node.templateType) {
      // Some AST nodes might have explicit templateType
      templateType = node.templateType;
      delimiterLength = templateType === 'tripleColon' ? 3 : (templateType === 'doubleColon' ? 2 : 1);
      if (templateType === 'tripleColon') {
        variableStyle = '{{var}}';
      }
    }
    
    if (templateType) {
      // Highlight template delimiters if we have delimiter locations
      if (node.openDelimiterLocation) {
        this.addToken({
          line: node.openDelimiterLocation.start.line - 1,
          char: node.openDelimiterLocation.start.column - 1,
          length: delimiterLength,
          tokenType: 'template',
          modifiers: []
        });
      }
      
      if (node.closeDelimiterLocation) {
        this.addToken({
          line: node.closeDelimiterLocation.start.line - 1,
          char: node.closeDelimiterLocation.start.column - 1,
          length: delimiterLength,
          tokenType: 'template',
          modifiers: []
        });
      }
      
      // Process template content with proper context
      this.pushContext({
        templateType,
        interpolationAllowed: true,
        variableStyle
      });
      
      this.visitChildren(node);
      
      this.popContext();
    }
  }
  
  visitStringLiteral(node: any): void {
    if (!node.location) return;
    
    const text = this.document.getText({
      start: { line: node.location.start.line - 1, character: node.location.start.column - 1 },
      end: { line: node.location.end.line - 1, character: node.location.end.column }
    });
    
    // Check if it's a single-quoted string (literal)
    const isSingleQuoted = text.startsWith("'") && text.endsWith("'");
    
    if (isSingleQuoted) {
      // Single quotes never interpolate - everything is literal
      this.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'string',
        modifiers: ['literal']
      });
    } else {
      // Double quotes always interpolate
      this.pushContext({
        interpolationAllowed: true,
        variableStyle: '@var'
      });
      
      this.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'string',
        modifiers: []
      });
      
      this.visitChildren(node);
      
      this.popContext();
    }
  }
  
  visitVariableReference(node: any): void {
    if (!node.location) return;
    
    const ctx = this.currentContext;
    const identifier = node.identifier || '';
    const valueType = node.valueType;
    
    // For variable declarations in directives, we've already handled them
    if (valueType === 'identifier') {
      return; // Already processed in visitDirective
    }
    
    // Get the actual text from the document to ensure we have the right syntax
    const actualText = this.document.getText({
      start: { line: node.location.start.line - 1, character: node.location.start.column - 1 },
      end: { line: node.location.end.line - 1, character: node.location.end.column - 1 }
    });
    
    // Check if we're in an interpolation context (templates, etc)
    if (ctx.interpolationAllowed && ctx.templateType) {
      // In triple-colon templates, varIdentifier actually represents {{var}} syntax
      if (ctx.templateType === 'tripleColon' && valueType === 'varIdentifier') {
        // The parser optimizes {{var}} to varIdentifier in triple-colon context
        this.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: actualText.length,
          tokenType: 'interpolation',
          modifiers: []
        });
      } else if (ctx.variableStyle === '@var' && valueType === 'varIdentifier') {
        this.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: actualText.length,
          tokenType: 'interpolation',
          modifiers: []
        });
      } else if (ctx.variableStyle === '{{var}}' && valueType === 'varInterpolation') {
        this.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: actualText.length,
          tokenType: 'interpolation',
          modifiers: []
        });
      } else if (actualText.startsWith('@')) {
        // Wrong style for context - mark as invalid
        this.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: actualText.length,
          tokenType: 'variable',
          modifiers: ['invalid']
        });
      }
    } else {
      // Not in template/interpolation context - regular variable reference
      if (valueType === 'varIdentifier' || valueType === 'varInterpolation') {
        this.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: actualText.length,
          tokenType: 'variableRef',
          modifiers: ['reference']
        });
      }
    }
  }
  
  visitLoadContent(node: any): void {
    if (!node.location) return;
    
    const ctx = this.currentContext;
    
    // Add token for the entire file reference
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.location.end.column - node.location.start.column,
      tokenType: 'alligator',
      modifiers: []
    });
    
    // If it has a section, add a separate token for that
    if (node.options?.section?.identifier) {
      const sectionNode = node.options.section.identifier;
      if (sectionNode.location) {
        this.addToken({
          line: sectionNode.location.start.line - 1,
          char: sectionNode.location.start.column - 1,
          length: sectionNode.location.end.column - sectionNode.location.start.column,
          tokenType: 'section',
          modifiers: []
        });
      }
    }
  }
  
  visitFileReference(node: any): void {
    if (!node.location) return;
    
    const ctx = this.currentContext;
    const text = this.extractText([node]);
    
    // In triple-colon, file references become XML
    if (ctx.templateType === 'tripleColon') {
      this.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'xmlTag',
        modifiers: []
      });
    } else {
      // File reference with alligator syntax (in any other context)
      this.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'alligator',
        modifiers: []
      });
      
      // If it has a section marker, highlight that separately
      if (node.section && node.sectionLocation) {
        this.addToken({
          line: node.sectionLocation.start.line - 1,
          char: node.sectionLocation.start.column - 1,
          length: node.section.length,
          tokenType: 'section',
          modifiers: []
        });
      }
    }
  }
  
  visitCommand(node: any): void {
    if (!node.location) return;
    
    // Check for language-specific commands
    if (node.language) {
      // Highlight the language identifier
      if (node.languageLocation) {
        this.addToken({
          line: node.languageLocation.start.line - 1,
          char: node.languageLocation.start.column - 1,
          length: node.language.length,
          tokenType: 'embedded',
          modifiers: []
        });
      }
      
      // Mark the code content for external highlighting
      if (node.codeLocation) {
        this.pushContext({
          interpolationAllowed: false,
          commandLanguage: node.language
        });
        
        this.addToken({
          line: node.codeLocation.start.line - 1,
          char: node.codeLocation.start.column - 1,
          length: node.code?.length || 0,
          tokenType: 'embeddedCode',
          modifiers: []
        });
        
        this.popContext();
      }
    } else {
      // Regular shell command - allow interpolation
      this.pushContext({
        inCommand: true,
        interpolationAllowed: true,
        variableStyle: '@var'
      });
      
      this.visitChildren(node);
      
      this.popContext();
    }
  }
  
  visitOperator(node: any): void {
    if (!node.location || !node.operator) return;
    
    // Handle operator array format ['>', undefined] or string format
    const operatorText = Array.isArray(node.operator) ? node.operator[0] : node.operator;
    
    if (operatorText) {
      // Handle UnaryExpression (e.g., !@var)
      if (node.type === 'UnaryExpression' && node.operand) {
        // For unary operators, the operator is at the start
        this.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: operatorText.length,
          tokenType: 'operator',
          modifiers: []
        });
        
        // Visit the operand
        this.visitNode(node.operand);
      }
      // Handle BinaryExpression (e.g., @a && @b)
      else if (node.left && node.right) {
        // Calculate operator position - it should be between left and right operands
        const operatorStart = node.left.location.end.column;
        
        this.addToken({
          line: node.location.start.line - 1,
          char: operatorStart,
          length: operatorText.length,
          tokenType: 'operator',
          modifiers: []
        });
        
        // Visit operands
        this.visitNode(node.left);
        this.visitNode(node.right);
      }
    }
  }
  
  visitLiteral(node: any): void {
    if (!node.location) return;
    
    const value = node.value;
    const valueType = node.valueType;
    let tokenType = 'string';
    let modifiers: string[] = [];
    
    if (typeof value === 'number') {
      tokenType = 'number';
    } else if (typeof value === 'boolean') {
      tokenType = 'boolean';
    } else if (value === null) {
      tokenType = 'null';
    } else if (valueType === 'string') {
      // String literals - check the source to see if single quoted
      const text = this.document.getText({
        start: { line: node.location.start.line - 1, character: node.location.start.column - 1 },
        end: { line: node.location.end.line - 1, character: node.location.end.column }
      });
      
      if (text.startsWith("'") && text.endsWith("'")) {
        modifiers.push('literal');
      }
    }
    
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.location.end.column - node.location.start.column,
      tokenType,
      modifiers
    });
  }
  
  visitComment(node: any): void {
    if (!node.location) return;
    
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.content?.length || 0,
      tokenType: 'comment',
      modifiers: []
    });
  }
  
  visitText(node: any): void {
    // Text nodes may contain embedded elements in templates
    if (this.currentContext.interpolationAllowed) {
      this.visitChildren(node);
    }
  }
  
  visitExpression(node: any): void {
    // Handle when expressions and other complex structures
    this.visitChildren(node);
  }
  
  private addToken(token: TokenInfo): void {
    const typeIndex = this.tokenTypes.indexOf(token.tokenType);
    if (typeIndex === -1) {
      console.warn(`Unknown token type: ${token.tokenType}`);
      return;
    }
    
    let modifierMask = 0;
    for (const modifier of token.modifiers) {
      const modifierIndex = this.tokenModifiers.indexOf(modifier);
      if (modifierIndex !== -1) {
        modifierMask |= 1 << modifierIndex;
      }
    }
    
    this.builder.push(
      token.line,
      token.char,
      token.length,
      typeIndex,
      modifierMask
    );
  }
  
  visitWhenExpression(node: any): void {
    if (!node.location) return;
    
    // Highlight 'when' keyword
    if (node.keywordLocation) {
      this.addToken({
        line: node.keywordLocation.start.line - 1,
        char: node.keywordLocation.start.column - 1,
        length: 4, // 'when'
        tokenType: 'keyword',
        modifiers: []
      });
    }
    
    // Visit conditions and actions
    this.visitChildren(node);
  }
  
  visitWhenDirective(node: any): void {
    // For when directives, we need to process condition and action
    if (node.values) {
      // Handle block form (e.g., /when @var first: [...])
      if (node.values.conditions && Array.isArray(node.values.conditions)) {
        // Visit the variable being tested
        if (node.values.variable) {
          if (Array.isArray(node.values.variable)) {
            for (const v of node.values.variable) {
              this.visitNode(v);
            }
          } else {
            this.visitNode(node.values.variable);
          }
        }
        
        // Visit each condition/action pair
        for (const pair of node.values.conditions) {
          // Visit condition
          if (pair.condition) {
            if (Array.isArray(pair.condition)) {
              for (const cond of pair.condition) {
                this.visitNode(cond);
              }
            } else {
              this.visitNode(pair.condition);
            }
          }
          
          // Visit action
          if (pair.action) {
            if (Array.isArray(pair.action)) {
              for (const action of pair.action) {
                this.visitNode(action);
              }
            } else {
              this.visitNode(pair.action);
            }
          }
        }
      }
      // Handle simple form (e.g., /when @condition => action)
      else if (node.values.condition) {
        // Visit condition (which may contain operators)
        if (Array.isArray(node.values.condition)) {
          for (const cond of node.values.condition) {
            this.visitNode(cond);
          }
        } else {
          this.visitNode(node.values.condition);
        }
        
        // Handle the => arrow operator
        if (node.values.action) {
          const conditionEnd = Array.isArray(node.values.condition) 
            ? node.values.condition[node.values.condition.length - 1].location?.end 
            : node.values.condition.location?.end;
          const actionStart = Array.isArray(node.values.action)
            ? node.values.action[0].location?.start
            : node.values.action.location?.start;
            
          if (conditionEnd && actionStart) {
            // Find the arrow position (between condition end and action start)
            const arrowChar = conditionEnd.column + 1; // Space after condition
            
            this.addToken({
              line: conditionEnd.line - 1,
              char: arrowChar - 1,
              length: 2, // =>
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
        
        // Visit action
        if (node.values.action) {
          if (Array.isArray(node.values.action)) {
            for (const action of node.values.action) {
              this.visitNode(action);
            }
          } else {
            this.visitNode(node.values.action);
          }
        }
      }
    }
  }
  
  visitExecInvocation(node: any): void {
    if (!node.location) return;
    
    // Highlight the function reference
    if (node.nameLocation) {
      this.addToken({
        line: node.nameLocation.start.line - 1,
        char: node.nameLocation.start.column - 1,
        length: node.name?.length || 0,
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
    }
    
    // Visit parameters
    if (node.parameters) {
      for (const param of node.parameters) {
        this.visitNode(param);
      }
    }
  }
  
  visitCommandReference(node: any): void {
    if (!node.location) return;
    
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.name?.length || this.extractText([node]).length,
      tokenType: 'variableRef',
      modifiers: ['reference']
    });
  }
  
  visitParameter(node: any): void {
    if (!node.location) return;
    
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.name?.length || this.extractText([node]).length,
      tokenType: 'parameter',
      modifiers: []
    });
  }
  
  visitPathSeparator(node: any): void {
    // Path separators are usually just visual, skip semantic tokens
  }
  
  visitDotSeparator(node: any): void {
    // Dot separators for field access - could highlight as operator
    if (node.location) {
      this.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: 1, // '.'
        tokenType: 'operator',
        modifiers: []
      });
    }
  }
  
  visitSectionMarker(node: any): void {
    if (!node.location) return;
    
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.content?.length || 1,
      tokenType: 'section',
      modifiers: []
    });
  }
  
  visitFrontmatter(node: any): void {
    if (!node.location) return;
    
    // Highlight frontmatter as metadata
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: 3, // '---'
      tokenType: 'comment',
      modifiers: []
    });
    
    // Visit content
    this.visitChildren(node);
    
    // Closing delimiter
    if (node.closeLocation) {
      this.addToken({
        line: node.closeLocation.start.line - 1,
        char: node.closeLocation.start.column - 1,
        length: 3, // '---'
        tokenType: 'comment',
        modifiers: []
      });
    }
  }
  
  visitCodeFence(node: any): void {
    if (!node.location) return;
    
    // Highlight language identifier if present
    if (node.language && node.languageLocation) {
      this.addToken({
        line: node.languageLocation.start.line - 1,
        char: node.languageLocation.start.column - 1,
        length: node.language.length,
        tokenType: 'embedded',
        modifiers: []
      });
    }
    
    // Mark code content for external highlighting
    if (node.codeLocation && node.language) {
      this.addToken({
        line: node.codeLocation.start.line - 1,
        char: node.codeLocation.start.column - 1,
        length: node.code?.length || 0,
        tokenType: 'embeddedCode',
        modifiers: [],
        data: { language: node.language } // VSCode can use this for injection
      });
    }
  }
  
  visitMlldRunBlock(node: any): void {
    // Similar to code fence but for mlld run blocks
    this.visitCodeFence(node);
  }
  
  visitError(node: any): void {
    if (!node.location) return;
    
    // Mark syntax errors
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.content?.length || 1,
      tokenType: 'variable',
      modifiers: ['invalid']
    });
  }
  
  visitTernaryExpression(node: any): void {
    if (!node.location) return;
    
    // Visit condition
    if (node.condition) this.visitNode(node.condition);
    
    // Highlight ? operator
    if (node.questionLocation) {
      this.addToken({
        line: node.questionLocation.start.line - 1,
        char: node.questionLocation.start.column - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    // Visit true branch
    if (node.trueBranch) this.visitNode(node.trueBranch);
    
    // Highlight : operator
    if (node.colonLocation) {
      this.addToken({
        line: node.colonLocation.start.line - 1,
        char: node.colonLocation.start.column - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    // Visit false branch
    if (node.falseBranch) this.visitNode(node.falseBranch);
  }
  
  private extractText(nodes: any[]): string {
    let text = '';
    for (const node of nodes) {
      if (node.type === 'Text' && node.content) {
        text += node.content;
      } else if (node.content) {
        text += node.content;
      } else if (node.value) {
        text += node.value;
      } else if (node.values && Array.isArray(node.values)) {
        text += this.extractText(node.values);
      }
    }
    return text.trim();
  }
  
  private handlePrimitiveValue(value: any, directive: any): void {
    // Calculate position after the = sign
    const source = this.document.getText();
    const directiveText = source.substring(directive.location.start.offset, directive.location.end.offset);
    const equalIndex = directiveText.indexOf('=');
    
    if (equalIndex === -1) return;
    
    // Find the actual value position after the equals sign
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
      tokenLength = 4; // 'null'
    } else if (typeof value === 'string') {
      // For strings, we need to include the quotes in the token
      const quotedLength = afterEqual.indexOf(afterEqual[0], 1) + 1;
      tokenLength = quotedLength;
      
      // Check if it's single-quoted
      if (afterEqual.startsWith("'")) {
        modifiers.push('literal');
      }
    }
    
    this.addToken({
      line: directive.location.start.line - 1,
      char: valueStart - 1,
      length: tokenLength,
      tokenType,
      modifiers
    });
  }
}