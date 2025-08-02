import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';

export class ExpressionVisitor extends BaseVisitor {
  private mainVisitor: any;
  private operatorHelper: OperatorTokenHelper;
  private tokenizedParentheses: Set<number>;
  
  constructor(document: any, tokenBuilder: any) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
    this.tokenizedParentheses = new Set();
  }
  
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
        // Unary operators are at the start of the node
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: operatorText.length,
          tokenType: 'operator',
          modifiers: []
        });
        
        this.mainVisitor.visitNode(node.operand, context);
      } else if (node.type === 'BinaryExpression') {
        // Check for parentheses before the left side
        const sourceText = this.document.getText();
        
        // Check if there's an opening parenthesis right before this expression
        if (node.location.start.offset > 0) {
          const charBefore = sourceText[node.location.start.offset - 1];
          if (charBefore === '(' && !this.tokenizedParentheses.has(node.location.start.offset - 1)) {
            this.operatorHelper.addOperatorToken(
              node.location.start.offset - 1,
              1
            );
            this.tokenizedParentheses.add(node.location.start.offset - 1);
          }
        }
        
        // Visit left side first
        this.mainVisitor.visitNode(node.left, context);
        
        // Use helper to tokenize binary operator
        this.operatorHelper.tokenizeBinaryExpression(node);
        
        // Visit right side after
        this.mainVisitor.visitNode(node.right, context);
        
        // Check for closing parenthesis after this expression
        if (node.location.end.offset < sourceText.length) {
          const charAfter = sourceText[node.location.end.offset];
          if (charAfter === ')' && !this.tokenizedParentheses.has(node.location.end.offset)) {
            this.operatorHelper.addOperatorToken(
              node.location.end.offset,
              1
            );
            this.tokenizedParentheses.add(node.location.end.offset);
          }
        }
      }
    }
  }
  
  private visitTernaryExpression(node: any, context: VisitorContext): void {
    if (node.condition) this.mainVisitor.visitNode(node.condition, context);
    
    if (node.trueBranch) this.mainVisitor.visitNode(node.trueBranch, context);
    
    if (node.falseBranch) this.mainVisitor.visitNode(node.falseBranch, context);
    
    // Use helper to tokenize ternary operators
    if (node.condition?.location && node.trueBranch?.location && node.falseBranch?.location) {
      this.operatorHelper.tokenizeTernaryOperators(
        node.condition.location.end.offset,
        node.trueBranch.location.start.offset,
        node.trueBranch.location.end.offset,
        node.falseBranch.location.start.offset
      );
    }
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
      this.operatorHelper.addOperatorToken(
        node.location.start.offset + openBracketIndex,
        1
      );
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
          
          // Determine the action start offset
          let actionStartOffset = null;
          if (firstAction?.location) {
            actionStartOffset = firstAction.location.start.offset;
          } else if (typeof firstAction === 'number' || typeof firstAction === 'string' || typeof firstAction === 'boolean' || firstAction === null) {
            // For primitive values, we need to search for them in the source text
            const sourceText = this.document.getText();
            const searchStart = lastCondition?.location?.end?.offset || node.location.start.offset;
            const searchEnd = node.location.end.offset;
            const searchText = sourceText.substring(searchStart, searchEnd);
            
            // Search for => first to know where to look for the value
            const arrowIndex = searchText.indexOf('=>');
            if (arrowIndex !== -1) {
              // Add the => token
              this.operatorHelper.addOperatorToken(searchStart + arrowIndex, 2);
              
              // Now search for the primitive value after =>
              const afterArrow = searchText.substring(arrowIndex + 2).trim();
              if (afterArrow.startsWith(String(firstAction))) {
                const valueOffset = searchStart + arrowIndex + 2 + searchText.substring(arrowIndex + 2).indexOf(afterArrow);
                actionStartOffset = valueOffset;
              }
            }
          }
            
          if (lastCondition?.location && actionStartOffset && !this.tokenizedParentheses.has(lastCondition.location.end.offset)) {
            this.operatorHelper.tokenizeOperatorBetween(
              lastCondition.location.end.offset,
              actionStartOffset,
              '=>'
            );
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
      this.operatorHelper.addOperatorToken(
        node.location.start.offset + closeBracketIndex,
        1
      );
    }
  }
}