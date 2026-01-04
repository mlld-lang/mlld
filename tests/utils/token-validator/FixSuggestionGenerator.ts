/**
 * FixSuggestionGenerator - Generates actionable fix suggestions for coverage gaps
 */

import type { CoverageGap, FixSuggestion } from './types.js';
import { VisitorMapper } from './VisitorMapper.js';

export class FixSuggestionGenerator {
  private visitorMapper: VisitorMapper;

  constructor() {
    this.visitorMapper = new VisitorMapper();
  }

  /**
   * Generate fix suggestion for a coverage gap
   */
  generateFixSuggestion(gap: CoverageGap): FixSuggestion {
    const visitorInfo = this.visitorMapper.getVisitorInfo(gap.nodeType);
    const suggestedMethod = this.inferMethod(gap);
    const codeExample = this.extractCodeExample(gap);

    return {
      visitorClass: visitorInfo.class,
      visitorFile: this.visitorMapper.getVisitorFilePath(gap.nodeType),
      suggestedMethod,
      helperClass: visitorInfo.helper,
      codeExample
    };
  }

  /**
   * Infer the method that should handle this node type
   */
  private inferMethod(gap: CoverageGap): string | undefined {
    // Node type to method mapping
    const methodMapping: Record<string, string> = {
      'VarDirective': 'visitVarDirective()',
      'ShowDirective': 'visitShowDirective()',
      'RunDirective': 'visitRunDirective()',
      'ExeDirective': 'visitExeDirective()',
      'WhenDirective': 'visitWhenDirective()',
      'ForDirective': 'visitForDirective()',
      'ImportDirective': 'visitImportDirective()',
      'ExportDirective': 'visitExportDirective()',
      'PathDirective': 'visitPathDirective()',
      'OutputDirective': 'visitOutputDirective()',
      'AppendDirective': 'visitAppendDirective()',
      'GuardDirective': 'visitGuardDirective()',
      'WhileDirective': 'visitWhileDirective()',
      'StreamDirective': 'visitStreamDirective()',
      'VariableReference': 'visitVariableReference()',
      'Parameter': 'visitParameter()',
      'Comment': 'visitComment()',
      'Literal': 'visitLiteral()',
      'BinaryExpression': 'visitBinaryExpression()',
      'UnaryExpression': 'visitUnaryExpression()',
      'TernaryExpression': 'visitTernaryExpression()',
      'WhenExpression': 'visitWhenExpression()',
      'ForExpression': 'visitForExpression()',
      'ExecInvocation': 'visitExecInvocation()',
      'CommandBlock': 'visitCommandBlock()',
      'StringLiteral': 'visitStringLiteral()',
      'AlligatorExpression': 'visitAlligatorExpression()',
      'SectionMarker': 'visitSectionMarker()',
      'MemberExpression': 'visitMemberExpression()',
      'Property': 'visitProperty()',
      'FieldAccessNode': 'visitFieldAccessNode()',
      'field': 'visitFieldAccess()',
      'numericField': 'visitNumericField()'
    };

    const method = methodMapping[gap.nodeType];

    if (method) {
      return method;
    }

    // For operator gaps, suggest helper methods
    if (gap.nodeType.endsWith('_operator')) {
      const operatorType = gap.text;
      if (operatorType === '.') {
        return 'tokenizePropertyAccess()';
      } else if (operatorType === '=>') {
        return 'tokenizeOperatorBetween()';
      } else if (operatorType === '=') {
        return 'tokenizeOperatorBetween()';
      } else if (operatorType === '|') {
        return 'tokenizePipelineOperators()';
      } else if (operatorType === '||') {
        return 'tokenizePipelineOperators()';
      } else if (operatorType === '&&' || operatorType === '==') {
        return 'tokenizeBinaryExpression()';
      }
    }

    return undefined;
  }

  /**
   * Extract minimal code example showing the gap
   */
  private extractCodeExample(gap: CoverageGap): string {
    // For short text, return as-is
    if (gap.text.length <= 50) {
      return gap.text;
    }

    // For longer text, truncate with context
    const lines = gap.text.split('\n');
    if (lines.length === 1) {
      // Single long line - show first 47 chars + ...
      return gap.text.substring(0, 47) + '...';
    }

    // Multi-line - show first 2 lines
    return lines.slice(0, 2).join('\n') + '\n...';
  }

  /**
   * Enhance gaps with fix suggestions
   */
  enhanceGapsWithFixes(gaps: CoverageGap[]): CoverageGap[] {
    return gaps.map(gap => ({
      ...gap,
      fix: this.generateFixSuggestion(gap)
    }));
  }

  /**
   * Group gaps by visitor for reporting
   */
  groupByVisitor(gaps: CoverageGap[]): Map<string, CoverageGap[]> {
    const grouped = new Map<string, CoverageGap[]>();

    for (const gap of gaps) {
      const visitor = gap.fix.visitorClass;
      if (!grouped.has(visitor)) {
        grouped.set(visitor, []);
      }
      grouped.get(visitor)!.push(gap);
    }

    return grouped;
  }

  /**
   * Get top issues by impact (occurrence count)
   */
  getTopIssues(gaps: CoverageGap[], limit: number = 5): Array<{
    nodeType: string;
    count: number;
    example: CoverageGap;
  }> {
    // Count by node type
    const counts = new Map<string, { count: number; example: CoverageGap }>();

    for (const gap of gaps) {
      const existing = counts.get(gap.nodeType);
      if (existing) {
        existing.count++;
      } else {
        counts.set(gap.nodeType, { count: 1, example: gap });
      }
    }

    // Sort by count
    const sorted = Array.from(counts.entries())
      .map(([nodeType, data]) => ({
        nodeType,
        count: data.count,
        example: data.example
      }))
      .sort((a, b) => b.count - a.count);

    return sorted.slice(0, limit);
  }
}
