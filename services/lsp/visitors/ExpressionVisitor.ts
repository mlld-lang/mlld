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
           node.type === 'WhenExpression' ||
           node.type === 'ForExpression' ||
           node.type === 'LoopExpression' ||
           node.type === 'LetAssignment' ||
           node.type === 'ExeReturn';
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
      case 'ForExpression':
        this.visitForExpression(node, context);
        break;
      case 'LoopExpression':
        this.visitLoopExpression(node, context);
        break;
      case 'LetAssignment':
        this.visitLetAssignment(node, context);
        break;
      case 'ExeReturn':
        this.visitExeReturn(node, context);
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
        const whenOffset = node.location.start.offset + whenIndex;
        const whenPos = this.document.positionAt(whenOffset);
        this.tokenBuilder.addToken({
          line: whenPos.line,
          char: whenPos.character,
          length: 4,
          tokenType: 'keyword',
          modifiers: []
        });
      }
    }

    // Handle 'first' modifier if present
    if (node.meta?.modifier === 'first') {
      const sourceText = this.document.getText();
      const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
      const firstIndex = nodeText.indexOf('first');

      if (firstIndex !== -1) {
        const firstOffset = node.location.start.offset + firstIndex;
        const firstPos = this.document.positionAt(firstOffset);
        this.tokenBuilder.addToken({
          line: firstPos.line,
          char: firstPos.character,
          length: 5,
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
      const colonOffset = node.location.start.offset + colonIndex;
      const colonPos = this.document.positionAt(colonOffset);
      this.tokenBuilder.addToken({
        line: colonPos.line,
        char: colonPos.character,
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
            // Handle nested array structure [[BinaryExpression]]
            if (Array.isArray(cond)) {
              cond.forEach((innerCond: any) => {
                this.mainVisitor.visitNode(innerCond, context);
              });
            } else {
              this.mainVisitor.visitNode(cond, context);
            }
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

          // For string literal actions, get a representative inner node for location
          if (firstAction?.content && firstAction?.wrapperType && firstAction.content[0]) {
            firstAction = firstAction.content[0];
          }

          // Find and tokenize the => operator between lastCondition and firstAction (narrow range)
          if (lastCondition?.location && firstAction?.location) {
            const searchStart = lastCondition.location.end.offset;
            const searchEnd = firstAction.location.start.offset;
            this.operatorHelper.tokenizeOperatorBetween(searchStart, searchEnd, '=>', 'modifier');
          } else if (lastCondition?.location) {
            // Fallback: search until end of when block
            const sourceText = this.document.getText();
            const searchText = sourceText.substring(lastCondition.location.end.offset, node.location.end.offset);
            const arrowIndex = searchText.indexOf('=>');
            if (arrowIndex !== -1) {
              this.operatorHelper.addOperatorToken(lastCondition.location.end.offset + arrowIndex, 2, 'modifier');
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
      this.operatorHelper.addOperatorToken(
        node.location.start.offset + closeBracketIndex,
        1
      );
    }
  }
  
  private visitForExpression(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    // Debug logging
    if (process.env.DEBUG_LSP || this.document.uri.includes('test-syntax')) {
      console.log('[FOR-EXPRESSION] Processing', { node });
    }
    
    // Add 'for' keyword token
    const sourceText = this.document.getText();
    const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    const forIndex = nodeText.indexOf('for');
    
    if (forIndex !== -1) {
      const forOffset = node.location.start.offset + forIndex;
      const forPos = this.document.positionAt(forOffset);
      this.tokenBuilder.addToken({
        line: forPos.line,
        char: forPos.character,
        length: 3,
        tokenType: 'keyword',
        modifiers: []
      });
    }

    // Tokenize optional parallel keyword and pacing tuple in expression form
    const parallelMatch = nodeText.match(/\bparallel\b/);
    if (parallelMatch && parallelMatch.index !== undefined) {
      const parPos = this.document.positionAt(node.location.start.offset + parallelMatch.index);
      this.tokenBuilder.addToken({
        line: parPos.line,
        char: parPos.character,
        length: 'parallel'.length,
        tokenType: 'keyword',
        modifiers: []
      });
    }
    const pacingMatch = nodeText.match(/\(([\s\d,smhd]+)\)\s*parallel/);
    if (pacingMatch && pacingMatch.index !== undefined) {
      const openOffset = node.location.start.offset + pacingMatch.index;
      const closeOffset = openOffset + pacingMatch[0].indexOf(')');
      // '('
      this.operatorHelper.addOperatorToken(openOffset, 1);
      const inner = pacingMatch[1];
      const innerStart = openOffset + 1;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (/\d/.test(ch)) {
          let j = i; while (j < inner.length && /\d/.test(inner[j])) j++;
          const numPos = this.document.positionAt(innerStart + i);
          this.tokenBuilder.addToken({
            line: numPos.line,
            char: numPos.character,
            length: j - i,
            tokenType: 'number',
            modifiers: []
          });
          i = j - 1; continue;
        }
        if (ch === ',') this.operatorHelper.addOperatorToken(innerStart + i, 1);
      }
      if (closeOffset >= openOffset) this.operatorHelper.addOperatorToken(closeOffset, 1);
    }
    
    // Process variable
    if (node.variable) {
      // Handle both single node and array format
      const varNode = Array.isArray(node.variable) ? node.variable[0] : node.variable;
      if (varNode) {
        this.mainVisitor.visitNode(varNode, context);
      }
    }
    
    // Find and tokenize "in" keyword
    const inMatch = nodeText.match(/\s+in\s+/);
    if (inMatch && inMatch.index !== undefined) {
      const inOffset = node.location.start.offset + inMatch.index + inMatch[0].indexOf('in');
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
    if (node.source && Array.isArray(node.source)) {
      for (const sourceNode of node.source) {
        this.mainVisitor.visitNode(sourceNode, context);
      }
    }
    
    // Find and tokenize "=>" operator
    const arrowMatch = nodeText.match(/\s+=>\s+/);
    if (arrowMatch && arrowMatch.index !== undefined) {
      const arrowOffset = node.location.start.offset + arrowMatch.index + arrowMatch[0].indexOf('=>');
      const arrowPosition = this.document.positionAt(arrowOffset);

      this.tokenBuilder.addToken({
        line: arrowPosition.line,
        char: arrowPosition.character,
        length: 2,
        tokenType: 'modifier',
        modifiers: []
      });
    }
    
    // Process expression
    if (node.expression && Array.isArray(node.expression)) {
      for (const exprNode of node.expression) {
        // Special handling for exec invocations and directives
        if (exprNode.type === 'ExecInvocation' || exprNode.type === 'Directive') {
          this.mainVisitor.visitNode(exprNode, context);
        } else if (exprNode.type === 'StringLiteral' || exprNode.content) {
          // Handle template literals
          const templateNode = {
            type: 'StringLiteral',
            location: exprNode.location,
            content: exprNode.content || [exprNode],
            wrapperType: exprNode.wrapperType || 'backtick'
          };
          this.mainVisitor.visitNode(templateNode, context);
        } else {
          this.mainVisitor.visitNode(exprNode, context);
        }
      }
    }
  }

  private visitLoopExpression(node: any, context: VisitorContext): void {
    if (!node.location) return;

    const sourceText = this.document.getText();
    const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    const loopIndex = nodeText.indexOf('loop');

    if (loopIndex !== -1) {
      const loopOffset = node.location.start.offset + loopIndex;
      const loopPos = this.document.positionAt(loopOffset);
      this.tokenBuilder.addToken({
        line: loopPos.line,
        char: loopPos.character,
        length: 4,
        tokenType: 'keyword',
        modifiers: []
      });
    }

    const headerMatch = nodeText.match(/\(([^)]*)\)/);
    if (headerMatch && headerMatch.index !== undefined) {
      const openOffset = node.location.start.offset + headerMatch.index;
      const closeOffset = openOffset + headerMatch[0].length - 1;
      this.operatorHelper.addOperatorToken(openOffset, 1);
      this.operatorHelper.addOperatorToken(closeOffset, 1);

      const inner = headerMatch[1];
      const innerStart = openOffset + 1;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (/\d/.test(ch)) {
          let j = i;
          while (j < inner.length && /\d/.test(inner[j])) j++;
          const numPos = this.document.positionAt(innerStart + i);
          this.tokenBuilder.addToken({
            line: numPos.line,
            char: numPos.character,
            length: j - i,
            tokenType: 'number',
            modifiers: []
          });
          i = j - 1;
          continue;
        }
        if (ch === ',') {
          this.operatorHelper.addOperatorToken(innerStart + i, 1);
        }
      }

      const endlessIndex = inner.indexOf('endless');
      if (endlessIndex !== -1) {
        const endlessPos = this.document.positionAt(innerStart + endlessIndex);
        this.tokenBuilder.addToken({
          line: endlessPos.line,
          char: endlessPos.character,
          length: 'endless'.length,
          tokenType: 'keyword',
          modifiers: []
        });
      }
    }

    if (node.limit && typeof node.limit === 'object' && node.limit.type) {
      this.mainVisitor.visitNode(node.limit, context);
    }

    const untilIndex = nodeText.indexOf('until');
    if (untilIndex !== -1) {
      const untilOffset = node.location.start.offset + untilIndex;
      const untilPos = this.document.positionAt(untilOffset);
      this.tokenBuilder.addToken({
        line: untilPos.line,
        char: untilPos.character,
        length: 'until'.length,
        tokenType: 'keyword',
        modifiers: []
      });
    }

    if (node.until && Array.isArray(node.until)) {
      for (const conditionNode of node.until) {
        this.mainVisitor.visitNode(conditionNode, context);
      }
    }

    const openBracketIndex = nodeText.indexOf('[');
    if (openBracketIndex !== -1) {
      this.operatorHelper.addOperatorToken(
        node.location.start.offset + openBracketIndex,
        1
      );
    }

    if (node.block && Array.isArray(node.block)) {
      for (const stmt of node.block) {
        this.mainVisitor.visitNode(stmt, context);
      }
    }

    const closeBracketIndex = nodeText.lastIndexOf(']');
    if (closeBracketIndex !== -1) {
      this.operatorHelper.addOperatorToken(
        node.location.start.offset + closeBracketIndex,
        1
      );
    }
  }

  private visitLetAssignment(node: any, context: VisitorContext): void {
    // Tokenize "let" keyword
    const sourceText = this.document.getText();
    const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    const letIndex = nodeText.indexOf('let');

    if (letIndex !== -1) {
      const letOffset = node.location.start.offset + letIndex;
      const letPos = this.document.positionAt(letOffset);
      this.tokenBuilder.addToken({
        line: letPos.line,
        char: letPos.character,
        length: 3,
        tokenType: 'keyword',
        modifiers: []
      });
    }

    // Tokenize @identifier
    if (node.identifier) {
      // Find @ position after "let "
      const atIndex = nodeText.indexOf('@', letIndex);
      if (atIndex !== -1) {
        const atOffset = node.location.start.offset + atIndex;
        const atPos = this.document.positionAt(atOffset);
        this.tokenBuilder.addToken({
          line: atPos.line,
          char: atPos.character,
          length: node.identifier.length + 1, // +1 for @
          tokenType: 'variable',
          modifiers: ['declaration']
        });
      }
    }

    // Tokenize = operator
    const equalIndex = nodeText.indexOf('=', letIndex);
    if (equalIndex !== -1) {
      this.operatorHelper.addOperatorToken(
        node.location.start.offset + equalIndex,
        1
      );
    }

    // Visit the value expression
    if (node.value && Array.isArray(node.value)) {
      for (const valueNode of node.value) {
        this.mainVisitor.visitNode(valueNode, context);
      }
    }
  }

  private visitExeReturn(node: any, context: VisitorContext): void {
    // Tokenize => operator
    const sourceText = this.document.getText();
    const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    const arrowIndex = nodeText.indexOf('=>');

    if (arrowIndex !== -1) {
      this.operatorHelper.addOperatorToken(
        node.location.start.offset + arrowIndex,
        2 // => is 2 characters
      );
    }

    // Visit the return value
    if (node.value) {
      if (Array.isArray(node.value)) {
        for (const valueNode of node.value) {
          this.mainVisitor.visitNode(valueNode, context);
        }
      } else {
        this.mainVisitor.visitNode(node.value, context);
      }
    }
  }
}
