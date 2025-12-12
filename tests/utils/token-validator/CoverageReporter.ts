/**
 * CoverageReporter - Formats validation results for terminal output
 */

import type { ValidationResult, CoverageGap } from './types.js';
import { FixSuggestionGenerator } from './FixSuggestionGenerator.js';

export class CoverageReporter {
  private fixSuggestionGenerator: FixSuggestionGenerator;

  constructor() {
    this.fixSuggestionGenerator = new FixSuggestionGenerator();
  }

  /**
   * Generate terminal report for validation results
   */
  generateReport(results: ValidationResult[], verbose: boolean = false): string {
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
    const topIssues = this.fixSuggestionGenerator.getTopIssues(allGaps, 5);

    lines.push(`🔴 Top Issues (${allGaps.length} total gaps)`);
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
}
