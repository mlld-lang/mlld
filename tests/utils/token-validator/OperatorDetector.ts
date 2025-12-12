/**
 * OperatorDetector - Finds operators between AST nodes that should be tokenized
 *
 * Operators like =>, =, ., | aren't AST nodes themselves, but they should
 * have semantic tokens. This class searches for them between nodes.
 */

import type { OperatorExpectation, SemanticToken, CoverageGap, FixSuggestion } from './types.js';
import type { SourceLocation } from '../../../core/types/primitives.js';

export class OperatorDetector {
  private operatorExpectations: OperatorExpectation[];

  constructor() {
    this.operatorExpectations = this.defineOperatorExpectations();
  }

  /**
   * Check for missing operator tokens in AST
   */
  checkOperators(
    ast: any[],
    tokens: SemanticToken[],
    input: string
  ): CoverageGap[] {
    const gaps: CoverageGap[] = [];
    const lines = input.split('\n');

    // Walk AST and look for operator contexts
    this.walkASTForOperators(ast, (node, context) => {
      for (const expectation of this.operatorExpectations) {
        if (this.shouldCheckOperator(node, context, expectation)) {
          const operatorPositions = this.findOperatorPositions(
            node,
            expectation.operator,
            input,
            lines
          );

          for (const pos of operatorPositions) {
            // Check if operator is tokenized
            const hasToken = tokens.some(token =>
              token.line === pos.line &&
              token.char <= pos.char &&
              token.char + token.length >= pos.char + expectation.operator.length &&
              token.tokenType === expectation.tokenType
            );

            if (!hasToken) {
              gaps.push(this.createOperatorGap(
                node,
                expectation,
                pos,
                input
              ));
            }
          }
        }
      }
    });

    return gaps;
  }

  /**
   * Define operator expectations
   */
  private defineOperatorExpectations(): OperatorExpectation[] {
    return [
      {
        operator: '=>',
        tokenType: 'operator',
        contexts: ['ExeDirective', 'ForDirective', 'WhenDirective', 'ForExpression'],
        findBetween: {
          leftNodeType: ['Parameter', 'VariableReference'],
          rightNodeType: ['*']
        }
      },
      {
        operator: '=',
        tokenType: 'operator',
        contexts: ['VarDirective', 'ExeDirective'],
        findBetween: {
          leftNodeType: ['VariableReference'],
          rightNodeType: ['*']
        }
      },
      {
        operator: '.',
        tokenType: 'operator',
        contexts: ['MemberExpression', 'VariableReference'],
        findBetween: {
          leftNodeType: ['VariableReference'],
          rightNodeType: ['field', 'numericField']
        }
      },
      {
        operator: '|',
        tokenType: 'operator',
        contexts: ['Pipeline', 'CondensedPipe'],
        findBetween: {
          leftNodeType: ['*'],
          rightNodeType: ['*']
        }
      },
      {
        operator: '||',
        tokenType: 'operator',
        contexts: ['Pipeline'],
        findBetween: {
          leftNodeType: ['*'],
          rightNodeType: ['*']
        }
      },
      {
        operator: '&&',
        tokenType: 'operator',
        contexts: ['BinaryExpression'],
        findBetween: {
          leftNodeType: ['*'],
          rightNodeType: ['*']
        }
      },
      {
        operator: '==',
        tokenType: 'operator',
        contexts: ['BinaryExpression'],
        findBetween: {
          leftNodeType: ['*'],
          rightNodeType: ['*']
        }
      },
      {
        operator: '!=',
        tokenType: 'operator',
        contexts: ['BinaryExpression'],
        findBetween: {
          leftNodeType: ['*'],
          rightNodeType: ['*']
        }
      }
    ];
  }

  /**
   * Walk AST looking for operator contexts
   */
  private walkASTForOperators(
    nodes: any[],
    callback: (node: any, context: string) => void
  ): void {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;

      if (node.type) {
        callback(node, node.type);
      }

      // Recurse into children
      for (const key of Object.keys(node)) {
        if (key === 'location' || key === 'type' || key === 'nodeId') continue;

        const value = node[key];
        if (Array.isArray(value)) {
          this.walkASTForOperators(value, callback);
        } else if (value && typeof value === 'object') {
          this.walkASTForOperators([value], callback);
        }
      }
    }
  }

  /**
   * Check if we should look for this operator in this node
   */
  private shouldCheckOperator(
    node: any,
    context: string,
    expectation: OperatorExpectation
  ): boolean {
    return expectation.contexts.includes(context);
  }

  /**
   * Find positions of operator in node
   */
  private findOperatorPositions(
    node: any,
    operator: string,
    input: string,
    lines: string[]
  ): Array<{ line: number; char: number }> {
    const positions: Array<{ line: number; char: number }> = [];

    if (!node.location) return positions;

    // Extract text for this node
    const text = this.extractNodeText(node.location, input);

    // Search for operator in text
    let index = text.indexOf(operator);
    while (index !== -1) {
      // Calculate absolute position
      const pos = this.calculateAbsolutePosition(
        node.location,
        index,
        lines
      );

      positions.push(pos);

      // Find next occurrence
      index = text.indexOf(operator, index + operator.length);
    }

    return positions;
  }

  /**
   * Extract text for a node location
   */
  private extractNodeText(location: SourceLocation, input: string): string {
    const lines = input.split('\n');

    if (location.start.line === location.end.line) {
      const line = lines[location.start.line - 1] || '';
      return line.substring(
        location.start.column - 1,
        location.end.column - 1
      );
    }

    // Multi-line
    const result: string[] = [];
    for (let i = location.start.line - 1; i < location.end.line; i++) {
      const line = lines[i] || '';
      if (i === location.start.line - 1) {
        result.push(line.substring(location.start.column - 1));
      } else if (i === location.end.line - 1) {
        result.push(line.substring(0, location.end.column - 1));
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Calculate absolute position from relative position in node
   */
  private calculateAbsolutePosition(
    location: SourceLocation,
    relativeIndex: number,
    lines: string[]
  ): { line: number; char: number } {
    // For single-line nodes, it's simple
    if (location.start.line === location.end.line) {
      return {
        line: location.start.line - 1, // Convert to 0-based
        char: location.start.column - 1 + relativeIndex
      };
    }

    // For multi-line nodes, need to calculate which line
    let currentIndex = 0;
    const startLine = location.start.line - 1;

    // First line length
    const firstLineText = lines[startLine].substring(location.start.column - 1);
    if (relativeIndex < firstLineText.length) {
      return {
        line: startLine,
        char: location.start.column - 1 + relativeIndex
      };
    }

    currentIndex += firstLineText.length + 1; // +1 for newline

    // Check subsequent lines
    for (let i = startLine + 1; i < location.end.line - 1; i++) {
      const lineText = lines[i];
      if (relativeIndex < currentIndex + lineText.length) {
        return {
          line: i,
          char: relativeIndex - currentIndex
        };
      }
      currentIndex += lineText.length + 1; // +1 for newline
    }

    // Last line
    const lastLine = location.end.line - 1;
    return {
      line: lastLine,
      char: relativeIndex - currentIndex
    };
  }

  /**
   * Create a coverage gap for missing operator
   */
  private createOperatorGap(
    node: any,
    expectation: OperatorExpectation,
    position: { line: number; char: number },
    input: string
  ): CoverageGap {
    const location: SourceLocation = {
      start: {
        line: position.line + 1, // Convert back to 1-based
        column: position.char + 1,
        offset: this.calculateOffset(input, position.line, position.char)
      },
      end: {
        line: position.line + 1,
        column: position.char + 1 + expectation.operator.length,
        offset: this.calculateOffset(input, position.line, position.char + expectation.operator.length)
      }
    };

    return {
      nodeId: node.nodeId || 'unknown',
      nodeType: `${node.type}_operator`,
      location,
      expectedTokenTypes: [expectation.tokenType],
      actualTokens: [],
      severity: 'error',
      text: expectation.operator,
      fix: this.createOperatorFix(node, expectation)
    };
  }

  /**
   * Calculate offset from line/char position
   */
  private calculateOffset(input: string, line: number, char: number): number {
    const lines = input.split('\n');
    let offset = 0;

    for (let i = 0; i < line; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }

    offset += char;

    return offset;
  }

  /**
   * Create fix suggestion for operator
   */
  private createOperatorFix(
    node: any,
    expectation: OperatorExpectation
  ): FixSuggestion {
    return {
      visitorClass: 'OperatorTokenHelper',
      visitorFile: '/Users/adam/dev/mlld/services/lsp/utils/OperatorTokenHelper.ts',
      suggestedMethod: `tokenize${this.operatorToMethodName(expectation.operator)}()`,
      codeExample: expectation.operator
    };
  }

  /**
   * Convert operator to method name
   */
  private operatorToMethodName(operator: string): string {
    const mapping: Record<string, string> = {
      '=>': 'Arrow',
      '=': 'Assignment',
      '.': 'Dot',
      '|': 'Pipe',
      '||': 'ParallelPipe',
      '&&': 'And',
      '==': 'Equals',
      '!=': 'NotEquals'
    };

    return mapping[operator] || 'Operator';
  }
}
