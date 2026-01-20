/**
 * AST Semantic Visitor for mlld Language Server (Refactored)
 * 
 * This visitor traverses the mlld AST and generates semantic tokens
 * with proper context awareness for template types, interpolation rules,
 * and embedded languages.
 */

import { SemanticTokensBuilder, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextStack, VisitorContext } from '@services/lsp/context/VisitorContext';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';
import { DirectiveVisitor } from '@services/lsp/visitors/DirectiveVisitor';
import { VariableVisitor } from '@services/lsp/visitors/VariableVisitor';
import { TemplateVisitor } from '@services/lsp/visitors/TemplateVisitor';
import { CommandVisitor } from '@services/lsp/visitors/CommandVisitor';
import { ExpressionVisitor } from '@services/lsp/visitors/ExpressionVisitor';
import { LiteralVisitor } from '@services/lsp/visitors/LiteralVisitor';
import { StructureVisitor } from '@services/lsp/visitors/StructureVisitor';
import { FileReferenceVisitor } from '@services/lsp/visitors/FileReferenceVisitor';
import { ForeachVisitor } from '@services/lsp/visitors/ForeachVisitor';
import { INodeVisitor } from '@services/lsp/visitors/base/VisitorInterface';
import { embeddedLanguageService } from '@services/lsp/embedded/EmbeddedLanguageService';
import type { VisitorDiagnostic } from '@tests/utils/token-validator/types.js';

export class ASTSemanticVisitor {
  private contextStack: ContextStack;
  private tokenBuilder: TokenBuilder;
  private visitors: Map<string, INodeVisitor>;
  private textCache = new Map<string, string>();
  private visitedNodeIds = new Set<string>();
  private visitorCalls: VisitorDiagnostic[] = [];
  
  constructor(
    private document: TextDocument,
    builder: SemanticTokensBuilder,
    tokenTypes: string[],
    tokenModifiers: string[],
    tokenTypeMap?: Record<string, string>
  ) {
    this.contextStack = new ContextStack();
    this.tokenBuilder = new TokenBuilder(builder, tokenTypes, tokenModifiers, document, tokenTypeMap);
    this.visitors = new Map();

    // Initialize template context from document URI for .att/.mtt files
    const uri = document.uri.toLowerCase();
    if (uri.endsWith('.att')) {
      this.contextStack.push({
        templateType: 'att',
        wrapperType: 'att',
        interpolationAllowed: true,
        variableStyle: '@var'
      });
    } else if (uri.endsWith('.mtt')) {
      this.contextStack.push({
        templateType: 'mtt',
        wrapperType: 'mtt',
        interpolationAllowed: true,
        variableStyle: '{{var}}'
      });
    }

    this.initializeVisitors();
  }
  
  private initializeVisitors(): void {
    const directiveVisitor = new DirectiveVisitor(this.document, this.tokenBuilder);
    const variableVisitor = new VariableVisitor(this.document, this.tokenBuilder);
    const templateVisitor = new TemplateVisitor(this.document, this.tokenBuilder);
    const commandVisitor = new CommandVisitor(this.document, this.tokenBuilder);
    const expressionVisitor = new ExpressionVisitor(this.document, this.tokenBuilder);
    const literalVisitor = new LiteralVisitor(this.document, this.tokenBuilder);
    const structureVisitor = new StructureVisitor(this.document, this.tokenBuilder);
    const fileReferenceVisitor = new FileReferenceVisitor(this.document, this.tokenBuilder);
    const foreachVisitor = new ForeachVisitor(this.document, this.tokenBuilder);
    
    directiveVisitor.setMainVisitor(this);
    variableVisitor.setMainVisitor(this);
    templateVisitor.setMainVisitor(this);
    commandVisitor.setMainVisitor(this);
    expressionVisitor.setMainVisitor(this);
    structureVisitor.setMainVisitor(this);
    fileReferenceVisitor.setMainVisitor(this);
    foreachVisitor.setMainVisitor(this);
    
    this.registerVisitor('Directive', directiveVisitor);
    this.registerVisitor('VariableReference', variableVisitor);
    this.registerVisitor('StringLiteral', templateVisitor);
    this.registerVisitor('Template', templateVisitor);
    this.registerVisitor('TemplateForBlock', templateVisitor);
    this.registerVisitor('TemplateInlineShow', templateVisitor);
    this.registerVisitor('Text', templateVisitor);
    this.registerVisitor('CommandBase', commandVisitor);
    this.registerVisitor('command', commandVisitor);
    this.registerVisitor('code', commandVisitor);
    this.registerVisitor('ExecInvocation', commandVisitor);
    this.registerVisitor('CommandReference', commandVisitor);
    this.registerVisitor('BinaryExpression', expressionVisitor);
    this.registerVisitor('UnaryExpression', expressionVisitor);
    this.registerVisitor('TernaryExpression', expressionVisitor);
    this.registerVisitor('NewExpression', expressionVisitor);
    this.registerVisitor('WhenExpression', expressionVisitor);
    this.registerVisitor('ForExpression', expressionVisitor);
    this.registerVisitor('Literal', literalVisitor);
    this.registerVisitor('ObjectExpression', structureVisitor);
    this.registerVisitor('object', structureVisitor);
    this.registerVisitor('ArrayExpression', structureVisitor);
    this.registerVisitor('array', structureVisitor);
    this.registerVisitor('Property', structureVisitor);
    this.registerVisitor('MemberExpression', structureVisitor);
    this.registerVisitor('field', structureVisitor);
    this.registerVisitor('numericField', structureVisitor);
    this.registerVisitor('arrayIndex', structureVisitor);
    this.registerVisitor('FileReference', fileReferenceVisitor);
    this.registerVisitor('load-content', fileReferenceVisitor);
    this.registerVisitor('Comment', fileReferenceVisitor);
    this.registerVisitor('Parameter', fileReferenceVisitor);
    this.registerVisitor('Frontmatter', fileReferenceVisitor);
    this.registerVisitor('CodeFence', fileReferenceVisitor);
    this.registerVisitor('MlldRunBlock', fileReferenceVisitor);
    this.registerVisitor('foreach', foreachVisitor);
    this.registerVisitor('foreach-command', foreachVisitor);
    this.registerVisitor('LetAssignment', expressionVisitor);
    this.registerVisitor('ExeReturn', expressionVisitor);
  }
  
  private registerVisitor(nodeType: string, visitor: INodeVisitor): void {
    this.visitors.set(nodeType, visitor);
  }
  
  get currentContext(): VisitorContext {
    return this.contextStack.current;
  }
  
  pushContext(context: Partial<VisitorContext>): void {
    this.contextStack.push(context);
  }
  
  popContext(): void {
    this.contextStack.pop();
  }

  getVisitorDiagnostics(): VisitorDiagnostic[] {
    return this.visitorCalls;
  }

  getTokenBuilder(): TokenBuilder {
    return this.tokenBuilder;
  }

  async visitAST(ast: any[]): Promise<void> {
    this.textCache.clear();
    this.visitedNodeIds.clear();
    this.visitorCalls = [];

    // Initialize embedded language service if not already initialized
    await embeddedLanguageService.initialize();
    
    if (process.env.DEBUG_LSP) {
      console.log('ASTSemanticVisitor: Processing AST with', ast.length, 'nodes');
    }
    
    for (const node of ast) {
      this.visitNode(node);
    }
  }
  
  visitNode(node: any, context?: VisitorContext): void {
    if (!node || !node.type) return;

    if (this.shouldSkipNode(node)) return;

    const actualContext = context || this.currentContext;

    const diagnostic: VisitorDiagnostic = {
      visitorClass: 'Unknown',
      nodeType: node.type,
      nodeId: node.nodeId || 'unknown',
      called: false,
      tokensEmitted: 0,
      tokensAccepted: 0,
      tokensRejected: 0
    };

    try {
      if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('fails.mld') || this.document.uri.includes('test-syntax')) {
        console.log(`[VISITOR] Node: ${node.type}`, {
          location: node.location ? `${node.location.start.line}:${node.location.start.column}` : 'none',
          content: node.content || node.identifier || node.value || '?'
        });
      }

      if (!node.location && node.type !== 'Text' && node.type !== 'Newline' && process.env.DEBUG_LSP) {
        console.warn(`Node type ${node.type} missing location`);
      }

      const visitor = this.visitors.get(node.type);
      if (visitor) {
        diagnostic.visitorClass = visitor.constructor.name;
        diagnostic.called = true;

        if (node.nodeId) {
          this.tokenBuilder.setSourceNode(node.nodeId);
        }

        const attemptsBefore = this.tokenBuilder.getAttempts().length;

        visitor.visitNode(node, actualContext);

        const attemptsAfter = this.tokenBuilder.getAttempts().length;
        const newAttempts = this.tokenBuilder.getAttempts().slice(attemptsBefore);

        diagnostic.tokensEmitted = newAttempts.length;
        diagnostic.tokensAccepted = newAttempts.filter(a => a.accepted).length;
        diagnostic.tokensRejected = newAttempts.filter(a => !a.accepted).length;

        this.tokenBuilder.clearSourceNode();

        // Visit children to ensure nested nodes are processed
        // Visitors that manually recurse will skip duplicates via valueType checks
        this.visitChildren(node, actualContext);
      } else {
        diagnostic.called = true;
        diagnostic.visitorClass = 'ASTSemanticVisitor';

        if (node.nodeId) {
          this.tokenBuilder.setSourceNode(node.nodeId);
        }

        const attemptsBefore = this.tokenBuilder.getAttempts().length;

        switch (node.type) {
          case 'Text':
            this.visitText(node, actualContext);
            break;
          case 'Newline':
            break;
          case 'Error':
            this.visitError(node);
            break;
          case 'Parameter':
            this.visitParameter(node, actualContext);
            break;
          case 'VariableReferenceWithTail':
            this.visitVariableReferenceWithTail(node, actualContext);
            break;
          case 'ExeBlock':
            this.visitExeBlock(node, actualContext);
            break;
          case 'LetAssignment':
            this.visitLetAssignment(node, actualContext);
            break;
          case 'AugmentedAssignment':
            this.visitAugmentedAssignment(node, actualContext);
            break;
          case 'ExeReturn':
            this.visitExeReturn(node, actualContext);
            break;
          case 'LabelModification':
            this.visitChildren(node, actualContext);
            break;
          default:
            console.warn(`Unknown node type: ${node.type}`);
            this.visitChildren(node, actualContext);
        }

        const attemptsAfter = this.tokenBuilder.getAttempts().length;
        const newAttempts = this.tokenBuilder.getAttempts().slice(attemptsBefore);

        diagnostic.tokensEmitted = newAttempts.length;
        diagnostic.tokensAccepted = newAttempts.filter(a => a.accepted).length;
        diagnostic.tokensRejected = newAttempts.filter(a => !a.accepted).length;

        this.tokenBuilder.clearSourceNode();
      }
    } catch (error) {
      diagnostic.called = true;
      console.error(`[SEMANTIC-TOKEN-ERROR] Error visiting node type ${node.type}:`, {
        error: error.message,
        stack: error.stack,
        node: {
          type: node.type,
          location: node.location,
          content: node.content || node.identifier || node.value
        }
      });
      // Continue processing other nodes
    }

    this.visitorCalls.push(diagnostic);
  }
  
  private shouldSkipNode(node: any): boolean {
    if (!node.type) return true;

    const skipTypes = ['Newline', 'Whitespace', 'EOF'];
    if (skipTypes.includes(node.type)) return true;

    if (node.error || node.isError) return false;

    if (node.type.startsWith('_') || node.type.startsWith('$')) return true;

    // Skip nodes we've already visited (prevents duplicates from manual recursion + visitChildren)
    if (node.nodeId && this.visitedNodeIds.has(node.nodeId)) {
      return true;
    }

    // Mark this node as visited
    if (node.nodeId) {
      this.visitedNodeIds.add(node.nodeId);
    }

    return false;
  }
  
  visitChildren(node: any, context?: VisitorContext): void {
    const actualContext = context || this.currentContext;

    // If this is a container object without .type, visit ALL its properties
    if (!node.type) {
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) {
          for (const child of value) {
            this.visitNode(child, actualContext);
          }
        } else if (value && typeof value === 'object') {
          this.visitNode(value, actualContext);
        }
      }
      return;
    }

    // For nodes with .type, check specific child properties
    const childProps = [
      'values',
      'value',
      'variable',
      'invocation',
      'withClause',
      'children',
      'body',
      'content',
      'nodes',
      'elements'
    ];

    for (const prop of childProps) {
      if (node[prop]) {
        if (Array.isArray(node[prop])) {
          for (const child of node[prop]) {
            this.visitNode(child, actualContext);
          }
        } else if (typeof node[prop] === 'object') {
          // Check if it's a node or a container object
          if (node[prop].type) {
            this.visitNode(node[prop], actualContext);
          } else {
            // Plain container object - recurse into its properties
            this.visitChildren(node[prop], actualContext);
          }
        }
      }
    }
  }
  
  visitText(node: any, context: VisitorContext): void {
    if (!node.location || !node.content) return;
    
    // In command context, check if this is a quoted string or a string argument
    if (context.inCommand) {
      if (node.content.startsWith('"') && node.content.endsWith('"')) {
        // String already has quotes
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: node.content.length,
          tokenType: 'string',
          modifiers: []
        });
      } else if (!node.content.includes(' ') && !node.content.startsWith('-')) {
        // String argument without quotes in AST - likely a function argument
        // Use the document text to get the actual source with quotes
        const source = this.document?.getText() || '';
        const lineStart = source.split('\n').slice(0, node.location.start.line - 1).join('\n').length + (node.location.start.line > 1 ? 1 : 0);
        const charStart = lineStart + node.location.start.column - 1;
        
        if (process.env.DEBUG_LSP === 'true') {
          console.log('[TEXT-QUOTE-CHECK]', {
            charStart,
            charBefore: charStart > 0 ? source[charStart - 1] : 'N/A',
            content: node.content,
            locationCol: node.location.start.column
          });
        }
        
        // Check if this is likely a quoted string argument
        // The AST location often points to the content, not the quotes
        // Check if we're in a context that suggests quotes (like after '(' or ',')
        const charBefore = charStart > 0 ? source[charStart - 1] : '';
        const isLikelyQuoted = charBefore === '(' || charBefore === ',' || charBefore === ' ';
        
        if (isLikelyQuoted) {
          // Use the AST's location span which should include quotes
          const tokenLength = node.location.end.column - node.location.start.column;
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: node.location.start.column - 1,
            length: tokenLength,
            tokenType: 'string',
            modifiers: []
          });
        } else {
          // Just tokenize the content as is
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: node.location.start.column - 1,
            length: node.content.length,
            tokenType: 'string',
            modifiers: []
          });
        }
      }
    } else if (context.templateType) {
      // In template context, add as template content or string
      const tokenType = context.templateType === 'string' ? 'string' : 'templateContent';
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: node.content.length,
        tokenType: tokenType,
        modifiers: []
      });
    }
    
    if (context.interpolationAllowed) {
      this.visitChildren(node, context);
    }
  }
  
  visitError(node: any): void {
    if (!node.location) {
      if (this.tryInferLocation(node)) {
      } else {
        return;
      }
    }
    
    const errorType = this.getErrorTokenType(node);
    
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.content?.length || node.text?.length || 1,
      tokenType: errorType,
      modifiers: ['invalid']
    });
    
    if (node.partialContent || node.children) {
      this.visitChildren(node);
    }
  }
  
  private tryInferLocation(node: any): boolean {
    if (node.parent?.location) {
      node.location = node.parent.location;
      return true;
    }
    
    if (node.previousSibling?.location && node.nextSibling?.location) {
      node.location = {
        start: node.previousSibling.location.end,
        end: node.nextSibling.location.start
      };
      return true;
    }
    
    return false;
  }
  
  private getErrorTokenType(node: any): string {
    if (node.expectedType) {
      switch (node.expectedType) {
        case 'directive': return 'directive';
        case 'variable': return 'variable';
        case 'string': return 'string';
        case 'number': return 'number';
        default: return 'variable';
      }
    }
    
    if (node.content || node.text) {
      const text = node.content || node.text;
      if (text.startsWith('/')) return 'directive';
      if (text.startsWith('@')) return 'variable';
      if (text.match(/^[\"']|^`|^::|^:::/)) return 'string';
      if (text.match(/^\\d/)) return 'number';
    }
    
    return 'variable';
  }
  
  visitParameter(node: any, context: VisitorContext): void {
    if (!node.location || !node.name) return;

    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.name.length,
      tokenType: 'parameter',
      modifiers: []
    });
  }

  visitVariableReferenceWithTail(node: any, context: VisitorContext): void {
    // Visit the main variable reference
    if (node.variable) {
      this.visitNode(node.variable, context);
    }

    // Handle the pipeline in withClause
    if (node.withClause?.pipeline && Array.isArray(node.withClause.pipeline)) {
      const source = this.document.getText();

      for (const transform of node.withClause.pipeline) {
        // Each transform has .identifier array with VariableReference nodes
        if (transform.identifier && Array.isArray(transform.identifier)) {
          for (const identNode of transform.identifier) {
            if (identNode.type === 'VariableReference' && identNode.location) {
              // Find the | operator before this transform
              const pipeOffset = source.lastIndexOf('|', identNode.location.start.offset);
              if (pipeOffset !== -1 && pipeOffset > (node.variable?.location?.end?.offset || 0)) {
                const pipePos = this.document.positionAt(pipeOffset);
                this.tokenBuilder.addToken({
                  line: pipePos.line,
                  char: pipePos.character,
                  length: 1,
                  tokenType: 'operator',
                  modifiers: []
                });
              }

              // Visit the variable reference in the pipeline
              this.visitNode(identNode, context);
            }
          }
        }
      }
    }
  }

  /**
   * Visit an ExeBlock node (statement block with let/+=/=> return)
   * Used in both /exe definitions and /var blocks
   */
  private visitExeBlock(node: any, context: VisitorContext): void {
    if (!node.location) return;

    const sourceText = this.document.getText();
    const blockText = sourceText.substring(node.location.start.offset, node.location.end.offset);

    // Tokenize opening bracket '['
    const openBracketIndex = blockText.indexOf('[');
    if (openBracketIndex !== -1) {
      const bracketOffset = node.location.start.offset + openBracketIndex;
      const bracketPos = this.document.positionAt(bracketOffset);
      this.tokenBuilder.addToken({
        line: bracketPos.line,
        char: bracketPos.character,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }

    // Process statements
    if (node.values?.statements && Array.isArray(node.values.statements)) {
      for (const statement of node.values.statements) {
        this.visitNode(statement, context);
      }
    }

    // Process return statement
    if (node.values?.return) {
      this.visitNode(node.values.return, context);
    }

    // Tokenize closing bracket ']'
    const closeBracketIndex = blockText.lastIndexOf(']');
    if (closeBracketIndex !== -1) {
      const bracketOffset = node.location.start.offset + closeBracketIndex;
      const bracketPos = this.document.positionAt(bracketOffset);
      this.tokenBuilder.addToken({
        line: bracketPos.line,
        char: bracketPos.character,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
  }

  /**
   * Visit a LetAssignment node (let @var = value)
   */
  private visitLetAssignment(node: any, context: VisitorContext): void {
    if (!node.location) return;

    const sourceText = this.document.getText();
    const letText = sourceText.substring(node.location.start.offset, node.location.end.offset);

    // Tokenize 'let' keyword
    const letMatch = letText.match(/^let\b/);
    if (letMatch) {
      const letPos = this.document.positionAt(node.location.start.offset);
      this.tokenBuilder.addToken({
        line: letPos.line,
        char: letPos.character,
        length: 3,
        tokenType: 'keyword',
        modifiers: []
      });
    }

    // Tokenize the variable being assigned (@identifier)
    if (node.identifier) {
      const atIndex = letText.indexOf(`@${node.identifier}`);
      if (atIndex !== -1) {
        const atOffset = node.location.start.offset + atIndex;
        const atPos = this.document.positionAt(atOffset);
        this.tokenBuilder.addToken({
          line: atPos.line,
          char: atPos.character,
          length: node.identifier.length + 1,
          tokenType: 'variable',
          modifiers: ['declaration']
        });
      }
    }

    // Tokenize '=' operator
    const eqMatch = letText.match(/\s*(=)\s*/);
    if (eqMatch && eqMatch.index !== undefined) {
      const eqOffset = node.location.start.offset + letText.indexOf('=', eqMatch.index);
      const eqPos = this.document.positionAt(eqOffset);
      this.tokenBuilder.addToken({
        line: eqPos.line,
        char: eqPos.character,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }

    // Process value expression
    if (node.value) {
      const valueNodes = Array.isArray(node.value) ? node.value : [node.value];
      for (const valueNode of valueNodes) {
        this.visitNode(valueNode, context);
      }
    }
  }

  /**
   * Visit an AugmentedAssignment node (@var += value)
   */
  private visitAugmentedAssignment(node: any, context: VisitorContext): void {
    if (!node.location) return;

    const sourceText = this.document.getText();
    const augText = sourceText.substring(node.location.start.offset, node.location.end.offset);

    // Tokenize the variable being assigned (@identifier)
    if (node.identifier) {
      const atIndex = augText.indexOf(`@${node.identifier}`);
      if (atIndex !== -1) {
        const atOffset = node.location.start.offset + atIndex;
        const atPos = this.document.positionAt(atOffset);
        this.tokenBuilder.addToken({
          line: atPos.line,
          char: atPos.character,
          length: node.identifier.length + 1,
          tokenType: 'variable',
          modifiers: ['modification']
        });
      }
    }

    // Tokenize the augmented operator (+=)
    if (node.operator) {
      const opMatch = augText.match(/\+=/);
      if (opMatch && opMatch.index !== undefined) {
        const opOffset = node.location.start.offset + opMatch.index;
        const opPos = this.document.positionAt(opOffset);
        this.tokenBuilder.addToken({
          line: opPos.line,
          char: opPos.character,
          length: 2,
          tokenType: 'operator',
          modifiers: []
        });
      }
    }

    // Process value expression
    if (node.value) {
      const valueNodes = Array.isArray(node.value) ? node.value : [node.value];
      for (const valueNode of valueNodes) {
        this.visitNode(valueNode, context);
      }
    }
  }

  /**
   * Visit an ExeReturn node (=> value)
   */
  private visitExeReturn(node: any, context: VisitorContext): void {
    if (!node.location) return;

    const sourceText = this.document.getText();
    const returnText = sourceText.substring(node.location.start.offset, node.location.end.offset);

    // Tokenize '=>' operator
    const arrowMatch = returnText.match(/^=>/);
    if (arrowMatch) {
      const arrowPos = this.document.positionAt(node.location.start.offset);
      this.tokenBuilder.addToken({
        line: arrowPos.line,
        char: arrowPos.character,
        length: 2,
        tokenType: 'modifier',
        modifiers: []
      });
    }

    // Process return values
    if (node.values) {
      const valueNodes = Array.isArray(node.values) ? node.values : [node.values];
      for (const valueNode of valueNodes) {
        this.visitNode(valueNode, context);
      }
    }
  }
}
