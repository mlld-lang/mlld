import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { LocationHelpers } from '@services/lsp/utils/LocationHelpers';
import { TextExtractor } from '@services/lsp/utils/TextExtractor';

export class DirectiveVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'Directive';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.kind.length + 1,
      tokenType: 'directive',
      modifiers: []
    });
    
    if (node.kind === 'when') {
      this.visitWhenDirective(node, context);
      return;
    }
    
    if ((node.kind === 'var' || node.kind === 'exe' || node.kind === 'path') && 
        node.values?.identifier) {
      this.handleVariableDeclaration(node);
      
      if (node.kind === 'exe' && node.values?.params) {
        for (const param of node.values.params) {
          this.mainVisitor.visitNode(param, context);
        }
      }
    }
    
    if (node.values) {
      this.visitDirectiveValues(node, context);
    }
  }
  
  private handleVariableDeclaration(node: any): void {
    const identifierNodes = node.values.identifier;
    if (Array.isArray(identifierNodes) && identifierNodes.length > 0) {
      const firstIdentifier = identifierNodes[0];
      const identifierName = firstIdentifier.identifier || '';
      
      if (identifierName) {
        const identifierStart = node.location.start.column + node.kind.length + 2;
        
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: identifierStart - 1,
          length: identifierName.length + 1,
          tokenType: 'variable',
          modifiers: ['declaration']
        });
      }
    }
  }
  
  private visitDirectiveValues(directive: any, context: VisitorContext): void {
    const values = directive.values;
    
    if (directive.kind === 'run') {
      this.visitRunDirective(directive, context);
      return;
    }
    
    if (directive.kind === 'exe' && values.template) {
      const newContext = {
        ...context,
        templateType: 'backtick' as const,
        interpolationAllowed: true,
        variableStyle: '@var' as const
      };
      
      for (const node of values.template) {
        this.mainVisitor.visitNode(node, newContext);
      }
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
      for (const node of values.value) {
        if (typeof node === 'object' && node !== null) {
          this.mainVisitor.visitNode(node, context);
        } else if (directive.location) {
          this.handlePrimitiveValue(node, directive);
        }
      }
    } else if (values.value !== undefined && directive.location) {
      this.handlePrimitiveValue(values.value, directive);
    }
    
    this.visitChildren(values, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
  }
  
  private visitRunDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;
    
    if (values?.lang) {
      const langText = TextExtractor.extract(Array.isArray(values.lang) ? values.lang : [values.lang]);
      if (langText && directive.location) {
        const langStart = directive.location.start.column + 4;
        
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: langStart,
          length: langText.length,
          tokenType: 'embedded',
          modifiers: []
        });
      }
      
      if (values.code && Array.isArray(values.code)) {
        for (const codeNode of values.code) {
          if (codeNode.location && codeNode.content) {
            const codeContent = codeNode.content;
            const codeStart = codeNode.location.start.column + langText.length + 2;
            
            this.tokenBuilder.addToken({
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
      if (values.command && Array.isArray(values.command)) {
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
        this.visitChildren(values, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
      }
    }
  }
  
  private visitTemplateValue(directive: any, context: VisitorContext): void {
    const wrapperType = directive.meta?.wrapperType;
    const values = directive.values?.value || [];
    
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
    }
    
    if (templateType && values.length > 0) {
      const firstValue = values[0];
      const lastValue = values[values.length - 1];
      
      if (firstValue.location) {
        const openDelimiterStart = firstValue.location.start.column - delimiterLength - 1;
        
        if (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon') {
          this.tokenBuilder.addToken({
            line: firstValue.location.start.line - 1,
            char: openDelimiterStart,
            length: delimiterLength,
            tokenType: 'template',
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
      
      if (lastValue.location && (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon')) {
        const closeDelimiterStart = lastValue.location.end.column;
        
        this.tokenBuilder.addToken({
          line: lastValue.location.end.line - 1,
          char: closeDelimiterStart,
          length: delimiterLength,
          tokenType: 'template',
          modifiers: []
        });
      }
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
      if (node.values.conditions && Array.isArray(node.values.conditions)) {
        if (node.values.variable) {
          if (Array.isArray(node.values.variable)) {
            for (const v of node.values.variable) {
              this.mainVisitor.visitNode(v, context);
            }
          } else {
            this.mainVisitor.visitNode(node.values.variable, context);
          }
        }
        
        if (node.values.patternType && node.values.patternLocation) {
          this.tokenBuilder.addToken({
            line: node.values.patternLocation.start.line - 1,
            char: node.values.patternLocation.start.column - 1,
            length: node.values.patternType.length + 1,
            tokenType: 'keyword',
            modifiers: []
          });
        }
        
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
          
          if (pair.arrowLocation) {
            this.tokenBuilder.addToken({
              line: pair.arrowLocation.start.line - 1,
              char: pair.arrowLocation.start.column - 1,
              length: 2,
              tokenType: 'operator',
              modifiers: []
            });
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
            const arrowChar = conditionEnd.column + 1;
            
            this.tokenBuilder.addToken({
              line: conditionEnd.line - 1,
              char: arrowChar - 1,
              length: 2,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
        
        if (node.values.action) {
          if (Array.isArray(node.values.action)) {
            for (const action of node.values.action) {
              this.mainVisitor.visitNode(action, context);
            }
          } else {
            this.mainVisitor.visitNode(node.values.action, context);
          }
        }
      }
    }
  }
}