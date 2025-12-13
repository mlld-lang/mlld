/**
 * TokenCoverageValidator - Main orchestrator for AST-driven semantic token validation
 */

import type {
  ValidationResult,
  CoverageGap,
  SemanticToken,
  NodeExpectation,
  FixtureData,
  FixSuggestion
} from './types.js';
import { NodeExpectationBuilder } from './NodeExpectationBuilder.js';
import { TokenMatcher } from './TokenMatcher.js';
import { FixSuggestionGenerator } from './FixSuggestionGenerator.js';

export class TokenCoverageValidator {
  private expectationBuilder: NodeExpectationBuilder;
  private tokenMatcher: TokenMatcher;
  private fixSuggestionGenerator: FixSuggestionGenerator;
  private useRealLSP: boolean;

  constructor(expectationBuilder: NodeExpectationBuilder, useRealLSP: boolean = false) {
    this.expectationBuilder = expectationBuilder;
    this.tokenMatcher = new TokenMatcher();
    this.fixSuggestionGenerator = new FixSuggestionGenerator();
    this.useRealLSP = useRealLSP;
  }

  /**
   * Validate a fixture's semantic token coverage
   */
  async validateFixture(fixture: FixtureData): Promise<ValidationResult> {
    const mode = this.inferMode(fixture);

    // Generate semantic tokens
    const tokens = await this.generateSemanticTokens(fixture.ast, fixture.input);

    // Build node expectations
    const expectations = this.expectationBuilder.buildExpectations(
      fixture.ast,
      mode,
      fixture.input
    );

    // Find gaps
    let gaps = this.findCoverageGaps(expectations, tokens, fixture.input);

    // Enhance gaps with fix suggestions
    gaps = this.fixSuggestionGenerator.enhanceGapsWithFixes(gaps);

    // Group by visitor
    const gapsByVisitor = this.fixSuggestionGenerator.groupByVisitor(gaps);

    return {
      fixturePath: fixture.name,
      mode,
      totalNodes: expectations.length,
      coveredNodes: expectations.length - gaps.length,
      gaps,
      gapsByVisitor,
      coveragePercentage: expectations.length > 0
        ? ((expectations.length - gaps.length) / expectations.length) * 100
        : 100
    };
  }

  /**
   * Generate semantic tokens for AST
   */
  private async generateSemanticTokens(
    ast: any[],
    input: string
  ): Promise<SemanticToken[]> {
    const { SemanticTokensBuilder } = await import('vscode-languageserver/node.js');
    const { TextDocument } = await import('vscode-languageserver-textdocument');
    const { ASTSemanticVisitor } = await import('../../../services/lsp/ASTSemanticVisitor.js');

    // Token type definitions (from language-server-impl.ts)
    const TOKEN_TYPES = [
      'keyword', 'variable', 'string', 'number', 'operator',
      'comment', 'function', 'parameter', 'property', 'type',
      'namespace', 'label', 'interface'
    ];

    const TOKEN_MODIFIERS = [
      'declaration', 'reference', 'readonly', 'static', 'deprecated',
      'invalid', 'interpolated', 'literal'
    ];

    const TOKEN_TYPE_MAP: Record<string, string> = {
      'directive': 'keyword',
      'variableRef': 'variable',
      'interpolation': 'variable',
      'template': 'operator',
      'templateContent': 'string',
      'embedded': 'label',
      'embeddedCode': 'string',
      'alligator': 'interface',
      'alligatorOpen': 'operator',
      'alligatorClose': 'operator',
      'xmlTag': 'type',
      'section': 'namespace',
      'boolean': 'keyword',
      'null': 'keyword',
      'keyword': 'keyword',
      'variable': 'variable',
      'string': 'string',
      'operator': 'operator',
      'parameter': 'parameter',
      'comment': 'comment',
      'number': 'number',
      'property': 'property'
    };

    // Create document
    const document = TextDocument.create('test.mld', 'mlld', 1, input);

    // Create builder that tracks tokens
    const tokens: SemanticToken[] = [];
    const builder = new SemanticTokensBuilder();
    const originalPush = builder.push.bind(builder);

    (builder as any).push = (
      line: number,
      char: number,
      length: number,
      typeIdx: number,
      modifiers: number
    ) => {
      const tokenType = typeIdx >= 0 && typeIdx < TOKEN_TYPES.length
        ? TOKEN_TYPES[typeIdx]
        : 'Other';

      tokens.push({ line, char, length, tokenType });
      return originalPush(line, char, length, typeIdx, modifiers);
    };

    // Run visitor
    const visitor = new ASTSemanticVisitor(
      document,
      builder,
      TOKEN_TYPES,
      TOKEN_MODIFIERS,
      TOKEN_TYPE_MAP
    );

    // Ensure AST is an array
    const astArray = Array.isArray(ast) ? ast : [ast];

    if (process.env.DEBUG) {
      console.log(`[VALIDATOR] AST nodes to process: ${astArray.length}`);
      astArray.forEach((n, i) => console.log(`  ${i}. ${n.type}`));
    }

    try {
      await visitor.visitAST(astArray);
    } catch (error) {
      console.error('[VALIDATOR] Error in visitAST:', error);
      throw error;
    }

    // Debug: log tokens if DEBUG env var set
    if (process.env.DEBUG) {
      console.log(`[VALIDATOR] Generated ${tokens.length} tokens:`);
      tokens.forEach(t => {
        const text = input.split('\n')[t.line]?.substring(t.char, t.char + t.length) || '?';
        console.log(`  Line ${t.line + 1}:${t.char} "${text}" → ${t.tokenType}`);
      });
    }

    return tokens;
  }

  /**
   * Find coverage gaps
   */
  private findCoverageGaps(
    expectations: NodeExpectation[],
    tokens: SemanticToken[],
    input: string
  ): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    for (const expectation of expectations) {
      const overlappingTokens = this.tokenMatcher.findOverlappingTokens(
        tokens,
        expectation.location
      );

      if (expectation.mustBeCovered && overlappingTokens.length === 0) {
        gaps.push(this.createGap(expectation, [], input));
      } else if (
        overlappingTokens.length > 0 &&
        !this.tokenMatcher.tokensMatchExpectation(overlappingTokens, expectation)
      ) {
        gaps.push(this.createGap(expectation, overlappingTokens, input));
      }
    }

    return gaps;
  }

  /**
   * Create a coverage gap
   */
  private createGap(
    expectation: NodeExpectation,
    actualTokens: SemanticToken[],
    input: string
  ): CoverageGap {
    const text = expectation.text ||
      this.tokenMatcher.extractText(input, expectation.location);

    // Determine severity based on what we found
    let severity: 'error' | 'warning' = 'error';
    if (actualTokens.length > 0) {
      // Tokens exist but wrong type - this is a warning (less severe)
      severity = 'warning';
    }

    if (process.env.DEBUG && actualTokens.length > 0) {
      console.log(`[GAP-ANALYSIS] ${expectation.nodeType} at ${expectation.location.start.line}:${expectation.location.start.column}`);
      console.log(`  Expected: ${expectation.expectedTokenTypes.join(', ')}`);
      console.log(`  Actual: ${actualTokens.map(t => t.tokenType).join(', ')}`);
      console.log(`  Text: "${text}"`);
    }

    return {
      nodeId: expectation.nodeId,
      nodeType: expectation.nodeType,
      location: expectation.location,
      expectedTokenTypes: expectation.expectedTokenTypes,
      actualTokens,
      severity,
      text,
      fix: this.createPlaceholderFix(expectation, text)
    };
  }

  /**
   * Create a placeholder fix (will be replaced by FixSuggestionGenerator)
   */
  private createPlaceholderFix(
    expectation: NodeExpectation,
    text: string
  ): FixSuggestion {
    return {
      visitorClass: 'Placeholder',
      visitorFile: '',
      codeExample: text
    };
  }

  /**
   * Infer mode from fixture
   */
  private inferMode(fixture: FixtureData): 'strict' | 'markdown' {
    if (fixture.mlldMode) {
      return fixture.mlldMode;
    }

    // Infer from fixture name
    if (fixture.name.includes('.mld') || fixture.name.includes('strict-mode')) {
      return 'strict';
    }

    return 'markdown';
  }
}
