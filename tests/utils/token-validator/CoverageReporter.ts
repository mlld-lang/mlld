/**
 * CoverageReporter - Formats validation results for terminal output
 */

import type { ValidationResult, CoverageGap, DiagnosticContext } from './types.js';
import { FixSuggestionGenerator } from './FixSuggestionGenerator.js';

export interface ReportOptions {
  verbose?: boolean;
  showDiagnostics?: boolean;
}

export class CoverageReporter {
  private fixSuggestionGenerator: FixSuggestionGenerator;

  constructor() {
    this.fixSuggestionGenerator = new FixSuggestionGenerator();
  }

  /**
   * Generate terminal report for validation results
   */
  generateReport(results: ValidationResult[], options: ReportOptions = {}): string {
    const verbose = options.verbose || false;
    const showDiagnostics = options.showDiagnostics || false;
    const lines: string[] = [];

    // Header
    lines.push(this.formatHeader());
    lines.push('');

    // Overall statistics
    const totalNodes = results.reduce((sum, r) => sum + r.totalNodes, 0);
    const totalGaps = results.reduce((sum, r) => sum + r.gaps.length, 0);
    const coverage = totalNodes > 0 ? ((totalNodes - totalGaps) / totalNodes) * 100 : 100;

    lines.push(`Coverage: ${totalNodes - totalGaps}/${totalNodes} nodes (${coverage.toFixed(1)}%)`);

    const passedCount = results.filter(r => r.gaps.length === 0).length;
    const failedCount = results.length - passedCount;
    lines.push(`Fixtures: ${passedCount} passed, ${failedCount} failed`);
    lines.push('');

    if (totalGaps === 0) {
      lines.push('✅ All fixtures have complete token coverage!');
      return lines.join('\n');
    }

    // Top issues
    lines.push(this.formatSeparator());
    lines.push('');

    const allGaps = results.flatMap(r => r.gaps);
    const missingTokens = allGaps.filter(g => g.severity === 'error');
    const wrongTypeTokens = allGaps.filter(g => g.severity === 'warning');

    if (wrongTypeTokens.length > 0) {
      lines.push(`⚠️  Wrong Token Types (${wrongTypeTokens.length} nodes have tokens but wrong type)`);
      lines.push('');
      const wrongTypeIssues = this.fixSuggestionGenerator.getTopIssues(wrongTypeTokens, 5);
      for (const issue of wrongTypeIssues) {
        lines.push(`   ${issue.nodeType} (${issue.count} occurrence${issue.count > 1 ? 's' : ''})`);
        lines.push(`   Expected: ${issue.example.expectedTokenTypes.join(', ')}`);

        const tokenDetails = issue.example.actualTokens.map(t =>
          `${t.tokenType}@${t.char}(len=${t.length})`
        ).join(', ');
        lines.push(`   Actual:   ${tokenDetails}`);

        const exampleFixture = results.find(r => r.gaps.some(g => g.nodeId === issue.example.nodeId));
        if (exampleFixture) {
          lines.push(`   Example:  ${exampleFixture.fixturePath} line ${issue.example.location.start.line}`);
          lines.push(`   Text:     "${issue.example.text}"`);
        }
        lines.push('');
      }
      lines.push('');
    }

    const topIssues = this.fixSuggestionGenerator.getTopIssues(missingTokens, 5);

    lines.push(`🔴 Missing Tokens (${missingTokens.length} total)`);
    lines.push('');

    for (let i = 0; i < topIssues.length; i++) {
      const issue = topIssues[i];
      lines.push(`${i + 1}. ${this.formatNodeType(issue.nodeType)} (${issue.count} occurrence${issue.count > 1 ? 's' : ''})`);
      lines.push('');
      lines.push(`   📁 Fix in: ${issue.example.fix.visitorFile}`);

      if (issue.example.fix.suggestedMethod) {
        lines.push(`   📝 Method:  ${issue.example.fix.suggestedMethod}`);
      }

      if (issue.example.fix.helperClass) {
        lines.push(`   🛠️  Helper:  ${issue.example.fix.helperClass}`);
      }

      lines.push('');

      // Show example
      const exampleFixture = results.find(r => r.gaps.some(g => g.nodeId === issue.example.nodeId));
      if (exampleFixture) {
        lines.push(`   Example from: ${exampleFixture.fixturePath}`);
        lines.push(`   Line ${issue.example.location.start.line}:`);
        lines.push('');
        lines.push(`   ${this.formatCodeExample(issue.example)}`);
        lines.push('');
      }

      // Show diagnostic trace if requested
      if (showDiagnostics && issue.example.diagnostic) {
        lines.push('   🔍 Diagnostic Trace:');
        lines.push(...this.formatDiagnosticTrace(issue.example.diagnostic, '      '));
        lines.push('');
      }
    }

    // Coverage by visitor
    if (verbose) {
      lines.push(this.formatSeparator());
      lines.push('');
      lines.push('Coverage by Visitor:');
      lines.push('');

      const visitorStats = this.calculateVisitorStats(results);
      for (const [visitor, stats] of visitorStats.entries()) {
        const pct = stats.total > 0 ? ((stats.covered / stats.total) * 100).toFixed(1) : '100.0';
        const status = stats.gaps === 0 ? '✓' : '⚠️';
        const gapsText = stats.gaps > 0 ? ` ${stats.gaps} gaps` : '';
        lines.push(`  ${visitor.padEnd(25)} ${stats.covered}/${stats.total} (${pct}%) ${status}${gapsText}`);
      }
      lines.push('');

      // Diagnostic summary
      if (showDiagnostics) {
        lines.push(...this.generateDiagnosticSummary(results));
      }
    }

    // Detailed gaps (if very verbose)
    if (verbose && results.length <= 5) {
      lines.push(this.formatSeparator());
      lines.push('');
      lines.push('Detailed Gaps by Fixture:');
      lines.push('');

      for (const result of results) {
        if (result.gaps.length === 0) continue;

        lines.push(`📄 ${result.fixturePath}`);
        lines.push(`   ${result.gaps.length} gap${result.gaps.length > 1 ? 's' : ''}`);
        lines.push('');

        for (const gap of result.gaps.slice(0, 10)) { // Limit to 10 per fixture
          lines.push(`   - ${gap.nodeType} at line ${gap.location.start.line}`);
          lines.push(`     Expected: ${gap.expectedTokenTypes.join(', ')}`);
          lines.push(`     Text: "${gap.text.substring(0, 40)}${gap.text.length > 40 ? '...' : ''}"`);
          lines.push('');
        }

        if (result.gaps.length > 10) {
          lines.push(`   ... and ${result.gaps.length - 10} more gaps`);
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate simple summary
   */
  generateSummary(result: ValidationResult): string {
    const status = result.gaps.length === 0 ? '✓' : '✗';
    const pct = result.coveragePercentage.toFixed(1);
    return `${status} ${result.fixturePath}: ${result.coveredNodes}/${result.totalNodes} (${pct}%)`;
  }

  /**
   * Format header
   */
  private formatHeader(): string {
    const line = '━'.repeat(60);
    return `┏${line}┓
┃ Semantic Token Coverage Report - Strict Mode${' '.repeat(13)}┃
┗${line}┛`;
  }

  /**
   * Format separator
   */
  private formatSeparator(): string {
    return '━'.repeat(60);
  }

  /**
   * Format node type for display
   */
  private formatNodeType(nodeType: string): string {
    // Remove _operator suffix
    if (nodeType.endsWith('_operator')) {
      const baseType = nodeType.replace('_operator', '');
      return `${baseType} operator not tokenized`;
    }

    // Make more readable
    const readable = nodeType
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase();

    return `${readable} not tokenized`;
  }

  /**
   * Format code example with context
   */
  private formatCodeExample(gap: CoverageGap): string {
    const lines = gap.text.split('\n');

    if (lines.length === 1) {
      // Single line - highlight the gap
      const line = lines[0];
      const indicator = ' '.repeat(gap.location.start.column - 1) + '^'.repeat(Math.max(1, gap.text.length));
      return `${line}\n   ${indicator} Missing token`;
    }

    // Multi-line - show first few lines
    return lines.slice(0, 3).join('\n   ');
  }

  /**
   * Calculate visitor statistics
   */
  private calculateVisitorStats(
    results: ValidationResult[]
  ): Map<string, { total: number; covered: number; gaps: number }> {
    const stats = new Map<string, { total: number; covered: number; gaps: number }>();

    for (const result of results) {
      for (const [visitor, gaps] of result.gapsByVisitor) {
        const existing = stats.get(visitor) || { total: 0, covered: 0, gaps: 0 };
        existing.gaps += gaps.length;
        existing.total += gaps.length;
        stats.set(visitor, existing);
      }

      // Count covered nodes per visitor (approximate from total - gaps)
      const totalGapCount = result.gaps.length;
      const totalNodeCount = result.totalNodes;
      const coveredCount = totalNodeCount - totalGapCount;

      // Distribute covered nodes evenly (rough approximation)
      const visitorCount = result.gapsByVisitor.size || 1;
      const coveredPerVisitor = Math.floor(coveredCount / visitorCount);

      for (const visitor of result.gapsByVisitor.keys()) {
        const existing = stats.get(visitor);
        if (existing) {
          existing.covered += coveredPerVisitor;
          existing.total += coveredPerVisitor;
        }
      }
    }

    return stats;
  }

  private formatDiagnosticTrace(diagnostic: DiagnosticContext, indent: string = ''): string[] {
    const lines: string[] = [];

    if (diagnostic.visitorCalls.length === 0) {
      lines.push(`${indent}✗ No visitor called for this node`);
      lines.push(`${indent}  Possible causes:`);
      lines.push(`${indent}  - Node type not registered in ASTSemanticVisitor`);
      lines.push(`${indent}  - Node skipped by shouldSkipNode()`);
    } else {
      for (const call of diagnostic.visitorCalls) {
        if (call.called) {
          lines.push(`${indent}✓ ${call.visitorClass}.visitNode() called`);

          if (call.tokensEmitted === 0) {
            lines.push(`${indent}  ✗ No tokens emitted`);
            lines.push(`${indent}    Visitor logic didn't create any tokens`);
          } else {
            lines.push(`${indent}  ↳ ${call.tokensEmitted} token(s) attempted`);
            lines.push(`${indent}    Accepted: ${call.tokensAccepted}, Rejected: ${call.tokensRejected}`);
          }
        } else {
          lines.push(`${indent}✗ ${call.visitorClass} not called`);
        }
      }
    }

    if (diagnostic.tokenAttempts.length > 0) {
      lines.push(`${indent}`);
      lines.push(`${indent}Token Emission Attempts:`);
      for (const attempt of diagnostic.tokenAttempts) {
        const status = attempt.accepted ? '✓' : '✗';
        const reason = attempt.rejectionReason ? ` - ${attempt.rejectionReason}` : '';
        lines.push(`${indent}  ${status} ${attempt.tokenType} at ${attempt.position.line}:${attempt.position.char} len=${attempt.position.length}${reason}`);
      }
    }

    return lines;
  }

  private generateDiagnosticSummary(results: ValidationResult[]): string[] {
    const lines: string[] = [];

    const allGaps = results.flatMap(r => r.gaps);

    const rejectionStats: Record<string, number> = {};
    const visitorNeverCalled = allGaps.filter(g =>
      g.diagnostic?.visitorCalls.every(v => !v.called) ?? false
    );

    for (const gap of allGaps) {
      if (!gap.diagnostic) continue;
      for (const attempt of gap.diagnostic.tokenAttempts) {
        if (!attempt.accepted && attempt.rejectionReason) {
          rejectionStats[attempt.rejectionReason] = (rejectionStats[attempt.rejectionReason] || 0) + 1;
        }
      }
    }

    lines.push(this.formatSeparator());
    lines.push('');
    lines.push('🔍 Diagnostic Summary:');
    lines.push('');
    lines.push(`  Nodes where visitor never called: ${visitorNeverCalled.length}`);

    if (Object.keys(rejectionStats).length > 0) {
      lines.push(`  Token rejection reasons:`);
      for (const [reason, count] of Object.entries(rejectionStats)) {
        lines.push(`    - ${reason}: ${count}`);
      }
    }

    return lines;
  }
}
