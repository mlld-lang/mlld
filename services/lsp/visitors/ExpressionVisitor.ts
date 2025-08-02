import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';

export class ExpressionVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'BinaryExpression' || 
           node.type === 'UnaryExpression' ||
           node.type === 'TernaryExpression' ||
           node.type === 'WhenExpression';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    switch (node.type) {
      case 'BinaryExpression':
      case 'UnaryExpression':
        this.visitOperator(node, context);
        break;
      case 'TernaryExpression':
        this.visitTernaryExpression(node, context);
        break;
      case 'WhenExpression':
        this.visitWhenExpression(node, context);
        break;
    }
  }
  
  private visitOperator(node: any, context: VisitorContext): void {
    if (!node.operator) return;
    
    const operatorText = Array.isArray(node.operator) ? node.operator[0] : node.operator;
    
    if (operatorText) {
      if (node.type === 'UnaryExpression' && node.operand) {
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: operatorText.length,
          tokenType: 'operator',
          modifiers: []
        });
        
        this.mainVisitor.visitNode(node.operand, context);
      } else if (node.left && node.right) {
        // Visit left side first
        this.mainVisitor.visitNode(node.left, context);
        
        // Calculate operator position
        // The operator is typically after a space following the left operand
        const sourceText = this.document.getText();
        const leftEnd = node.left.location.end.offset;
        const rightStart = node.right.location.start.offset;
        const between = sourceText.substring(leftEnd, rightStart);
        const operatorIndex = between.indexOf(operatorText);
        
        if (operatorIndex !== -1) {
          // Calculate the actual position of the operator
          const operatorLine = node.left.location.end.line - 1;
          const operatorChar = node.left.location.end.column - 1 + operatorIndex;
          
          // Debug logging
          if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('test-syntax')) {
            console.log(`[OPERATOR] Found ${operatorText} at line ${operatorLine}, char ${operatorChar}`);
          }
          
          this.tokenBuilder.addToken({
            line: operatorLine,
            char: operatorChar,
            length: operatorText.length,
            tokenType: 'operator',
            modifiers: []
          });
        }
        
        // Visit right side after
        this.mainVisitor.visitNode(node.right, context);
      }
    }
  }
  
  private visitTernaryExpression(node: any, context: VisitorContext): void {
    if (node.condition) this.mainVisitor.visitNode(node.condition, context);
    
    // Add '?' operator between condition and trueBranch
    if (node.condition?.location && node.trueBranch?.location) {
      const sourceText = this.document.getText();
      const start = node.condition.location.end.offset;
      const end = node.trueBranch.location.start.offset;
      const between = sourceText.substring(start, end);
      const questionIndex = between.indexOf('?');
      
      if (questionIndex !== -1) {
        this.tokenBuilder.addToken({
          line: node.condition.location.end.line - 1,
          char: node.condition.location.end.column + questionIndex - 1,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
    }
    
    if (node.trueBranch) this.mainVisitor.visitNode(node.trueBranch, context);
    
    // Add ':' operator between trueBranch and falseBranch
    if (node.trueBranch?.location && node.falseBranch?.location) {
      const sourceText = this.document.getText();
      const start = node.trueBranch.location.end.offset;
      const end = node.falseBranch.location.start.offset;
      const between = sourceText.substring(start, end);
      const colonIndex = between.indexOf(':');
      
      if (colonIndex !== -1) {
        this.tokenBuilder.addToken({
          line: node.trueBranch.location.end.line - 1,
          char: node.trueBranch.location.end.column + colonIndex - 1,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
    }
    
    if (node.falseBranch) this.mainVisitor.visitNode(node.falseBranch, context);
  }
  
  private visitWhenExpression(node: any, context: VisitorContext): void {
    // Add 'when' keyword token
    if (node.keywordLocation) {
      this.tokenBuilder.addToken({
        line: node.keywordLocation.start.line - 1,
        char: node.keywordLocation.start.column - 1,
        length: 4,
        tokenType: 'keyword',
        modifiers: []
      });
    } else {
      // If no keywordLocation, find "when" in the source text
      const sourceText = this.document.getText();
      const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
      const whenIndex = nodeText.indexOf('when');
      
      if (whenIndex !== -1) {
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column + whenIndex - 1,
          length: 4,
          tokenType: 'keyword',
          modifiers: []
        });
      }
    }
    
    // Find and tokenize the ':' after 'when'
    const sourceText = this.document.getText();
    const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    const colonIndex = nodeText.indexOf(':');
    
    if (colonIndex !== -1) {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column + colonIndex - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    // Find and tokenize opening '['
    const openBracketIndex = nodeText.indexOf('[', colonIndex);
    if (openBracketIndex !== -1) {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column + openBracketIndex - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    // Process each condition/action pair
    if (node.conditions && Array.isArray(node.conditions)) {
      node.conditions.forEach((conditionPair: any) => {
        // Visit condition expression(s)
        if (conditionPair.condition && Array.isArray(conditionPair.condition)) {
          conditionPair.condition.forEach((cond: any) => {
            this.mainVisitor.visitNode(cond, context);
          });
        }
        
        // Find and tokenize '=>' between condition and action
        if (conditionPair.condition && conditionPair.action) {
          const lastCondition = Array.isArray(conditionPair.condition) 
            ? conditionPair.condition[conditionPair.condition.length - 1] 
            : conditionPair.condition;
          let firstAction = Array.isArray(conditionPair.action) 
            ? conditionPair.action[0] 
            : conditionPair.action;
            
          // For string literal actions, get the location from the content
          if (firstAction?.content && firstAction?.wrapperType && firstAction.content[0]) {
            firstAction = firstAction.content[0];
          }
            
          if (lastCondition?.location && firstAction?.location) {
            const betweenText = sourceText.substring(
              lastCondition.location.end.offset,
              firstAction.location.start.offset
            );
            const arrowIndex = betweenText.indexOf('=>');
            
            if (arrowIndex !== -1) {
              const position = this.document.positionAt(lastCondition.location.end.offset + arrowIndex);
              this.tokenBuilder.addToken({
                line: position.line,
                char: position.character,
                length: 2,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }
        }
        
        // Visit action expression(s)
        if (conditionPair.action) {
          if (Array.isArray(conditionPair.action)) {
            conditionPair.action.forEach((action: any) => {
              // Handle string literal actions (they have content property)
              if (action.content && action.wrapperType) {
                // This is a string literal - visit as a StringLiteral node
                // We need to adjust the location to include the quotes
                const firstContent = action.content[0];
                if (firstContent?.location) {
                  const adjustedLocation = {
                    start: {
                      ...firstContent.location.start,
                      column: firstContent.location.start.column - 1, // Include opening quote
                      offset: firstContent.location.start.offset - 1
                    },
                    end: {
                      ...firstContent.location.end,
                      column: firstContent.location.end.column + 1, // Include closing quote
                      offset: firstContent.location.end.offset + 1
                    }
                  };
                  const stringNode = {
                    type: 'StringLiteral',
                    location: adjustedLocation,
                    content: action.content,
                    wrapperType: action.wrapperType
                  };
                  this.mainVisitor.visitNode(stringNode, context);
                }
              } else {
                this.mainVisitor.visitNode(action, context);
              }
            });
          } else {
            this.mainVisitor.visitNode(conditionPair.action, context);
          }
        }
      });
    }
    
    // Find and tokenize closing ']'
    const closeBracketIndex = nodeText.lastIndexOf(']');
    if (closeBracketIndex !== -1) {
      const position = this.document.positionAt(node.location.start.offset + closeBracketIndex);
      this.tokenBuilder.addToken({
        line: position.line,
        char: position.character,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
  }
}