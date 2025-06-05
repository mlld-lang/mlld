import * as vscode from 'vscode';
import { DocumentAnalyzer } from '../utils/document-analyzer';

export class MlldSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  private legend: vscode.SemanticTokensLegend;
  
  constructor(private analyzer: DocumentAnalyzer) {
    // Define token types and modifiers
    const tokenTypes = [
      'variable',
      'parameter',
      'property',
      'function',
      'keyword',
      'string',
      'number',
      'operator'
    ];
    
    const tokenModifiers = [
      'declaration',
      'readonly',
      'deprecated',
      'modification'
    ];
    
    this.legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
  }

  getLegend(): vscode.SemanticTokensLegend {
    return this.legend;
  }

  async provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.SemanticTokens | null> {
    const analysis = await this.analyzer.analyzeDocument(document);
    if (!analysis || analysis.errors.length > 0) {
      return null;
    }

    const builder = new vscode.SemanticTokensBuilder(this.legend);
    
    // Process AST nodes
    for (const node of analysis.ast) {
      if (token.isCancellationRequested) {
        return null;
      }
      
      this.processNode(document, node, builder);
    }
    
    return builder.build();
  }

  private processNode(
    document: vscode.TextDocument,
    node: any,
    builder: vscode.SemanticTokensBuilder
  ) {
    switch (node.type) {
      case 'Directive':
        this.processDirective(document, node, builder);
        break;
      
      case 'Variable':
        this.addToken(document, node, builder, 'variable', []);
        break;
      
      case 'Literal':
        if (typeof node.value === 'string') {
          this.addToken(document, node, builder, 'string', []);
        } else if (typeof node.value === 'number') {
          this.addToken(document, node, builder, 'number', []);
        }
        break;
    }
    
    // Process child nodes
    for (const key in node) {
      const value = node[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach(child => {
            if (child && child.type) {
              this.processNode(document, child, builder);
            }
          });
        } else if (value.type) {
          this.processNode(document, value, builder);
        }
      }
    }
  }

  private processDirective(
    document: vscode.TextDocument,
    directive: any,
    builder: vscode.SemanticTokensBuilder
  ) {
    // Highlight directive keywords
    if (directive.position) {
      const start = directive.position.start;
      const directiveType = this.getDirectiveType(directive.subtype);
      
      // Add semantic token for @keyword
      const position = new vscode.Position(start.line - 1, start.column - 1);
      const range = document.getWordRangeAtPosition(position, /@\w+/);
      
      if (range) {
        builder.push(range, 'keyword', ['readonly']);
      }
    }
    
    // Highlight variable declarations
    if (directive.variable && directive.variable.position) {
      this.addToken(document, directive.variable, builder, 'variable', ['declaration']);
    }
    
    // Special handling for different directive types
    switch (directive.subtype) {
      case 'AddTemplate':
        // Highlight template name as function
        if (directive.templateName) {
          this.addToken(document, directive.templateName, builder, 'function', ['declaration']);
        }
        // Highlight parameters
        if (directive.parameters) {
          directive.parameters.forEach((param: any) => {
            this.addToken(document, param, builder, 'parameter', ['declaration']);
          });
        }
        break;
      
      case 'AddTemplateInvocation':
        // Highlight template invocation as function call
        if (directive.templateName) {
          this.addToken(document, directive.templateName, builder, 'function', []);
        }
        break;
      
      case 'DataAssignment':
        // Process JSON-like structures for better highlighting
        if (directive.value) {
          this.processDataValue(document, directive.value, builder);
        }
        break;
    }
  }

  private processDataValue(
    document: vscode.TextDocument,
    value: any,
    builder: vscode.SemanticTokensBuilder
  ) {
    if (value.type === 'Object' && value.properties) {
      value.properties.forEach((prop: any) => {
        if (prop.key) {
          this.addToken(document, prop.key, builder, 'property', []);
        }
        if (prop.value) {
          this.processDataValue(document, prop.value, builder);
        }
      });
    } else if (value.type === 'Array' && value.elements) {
      value.elements.forEach((elem: any) => {
        this.processDataValue(document, elem, builder);
      });
    }
  }

  private addToken(
    document: vscode.TextDocument,
    node: any,
    builder: vscode.SemanticTokensBuilder,
    tokenType: string,
    modifiers: string[]
  ) {
    if (!node.position) return;
    
    const start = new vscode.Position(
      node.position.start.line - 1,
      node.position.start.column - 1
    );
    
    const end = new vscode.Position(
      node.position.end.line - 1,
      node.position.end.column - 1
    );
    
    const range = new vscode.Range(start, end);
    builder.push(range, tokenType, modifiers);
  }

  private getDirectiveType(subtype: string): string {
    const prefix = subtype.replace(/Assignment|Code|Command|All|Selected|Template.*/, '');
    return prefix.toLowerCase();
  }
}