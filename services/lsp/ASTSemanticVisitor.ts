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
    
    // Handle variable declarations
    if ((node.kind === 'var' || node.kind === 'exe' || node.kind === 'path') && 
        node.values?.identifier) {
      const identifierNodes = node.values.identifier;
      if (Array.isArray(identifierNodes) && identifierNodes.length > 0) {
        const firstIdentifier = identifierNodes[0];
        if (firstIdentifier.location) {
          this.addToken({
            line: firstIdentifier.location.start.line - 1,
            char: firstIdentifier.location.start.column - 1,
            length: this.extractText([firstIdentifier]).length,
            tokenType: 'variable',
            modifiers: ['declaration']
          });
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
    
    // Handle based on the directive kind and meta info
    if (directive.meta?.wrapperType) {
      // This is a template-like value
      this.visitTemplateValue(directive);
    } else if (values.command) {
      this.visitCommand(values.command);
    } else if (values.expression) {
      this.visitExpression(values.expression);
    } else if (values.value && Array.isArray(values.value)) {
      // Visit the value array content
      for (const node of values.value) {
        this.visitNode(node);
      }
    }
    
    // Visit other child nodes
    this.visitChildren(values);
  }
  
  visitTemplateValue(directive: any): void {
    const wrapperType = directive.meta?.wrapperType;
    const values = directive.values?.value || [];
    
    // Determine template context from wrapperType
    let templateType: 'backtick' | 'doubleColon' | 'tripleColon' | 'doubleQuote' | 'singleQuote' | null = null;
    let variableStyle: '@var' | '{{var}}' = '@var';
    let interpolationAllowed = true;
    
    switch (wrapperType) {
      case 'backtick':
        templateType = 'backtick';
        break;
      case 'doubleColon':
        templateType = 'doubleColon';
        break;
      case 'tripleColon':
        templateType = 'tripleColon';
        variableStyle = '{{var}}';
        break;
      case 'doubleQuote':
        templateType = 'doubleQuote';
        break;
      case 'singleQuote':
        templateType = 'singleQuote';
        interpolationAllowed = false;
        break;
    }
    
    if (templateType) {
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
    const text = node.content || this.extractText([node]);
    
    // Check if we're in an interpolation context
    if (ctx.interpolationAllowed) {
      if (ctx.variableStyle === '@var' && text.startsWith('@')) {
        this.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: text.length,
          tokenType: 'interpolation',
          modifiers: []
        });
      } else if (ctx.variableStyle === '{{var}}' && 
                 text.startsWith('{{') && text.endsWith('}}')) {
        this.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: text.length,
          tokenType: 'interpolation',
          modifiers: []
        });
      } else {
        // Wrong style for context - mark as invalid
        this.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: text.length,
          tokenType: 'variable',
          modifiers: ['invalid']
        });
      }
    } else {
      // Not in interpolation context - regular variable reference
      this.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
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
    } else if (ctx.interpolationAllowed && ctx.variableStyle === '@var') {
      // File reference with alligator syntax
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
    
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.operator.length,
      tokenType: 'operator',
      modifiers: []
    });
    
    // Visit operands
    if (node.left) this.visitNode(node.left);
    if (node.right) this.visitNode(node.right);
  }
  
  visitLiteral(node: any): void {
    if (!node.location) return;
    
    const value = node.value;
    let tokenType = 'string';
    
    if (typeof value === 'number') {
      tokenType = 'number';
    } else if (typeof value === 'boolean') {
      tokenType = 'boolean';
    } else if (value === null) {
      tokenType = 'null';
    }
    
    this.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: String(value).length,
      tokenType,
      modifiers: []
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
}