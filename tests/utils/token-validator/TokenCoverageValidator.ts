/**
 * TokenCoverageValidator - Main orchestrator for AST-driven semantic token validation
 */

import type {
  ValidationResult,
  CoverageGap,
  SemanticToken,
  NodeExpectation,
  FixtureData,
  FixSuggestion,
  NodeTokenRule
} from './types.js';
import { NodeExpectationBuilder } from './NodeExpectationBuilder.js';
import { TokenMatcher } from './TokenMatcher.js';
import { FixSuggestionGenerator } from './FixSuggestionGenerator.js';

export class TokenCoverageValidator {
  private expectationBuilder: NodeExpectationBuilder;
  private tokenMatcher: TokenMatcher;
  private fixSuggestionGenerator: FixSuggestionGenerator;
  private nodeTokenRules: Map<string, NodeTokenRule>;
  private useRealLSP: boolean;

  constructor(expectationBuilder: NodeExpectationBuilder, nodeTokenRules: Map<string, NodeTokenRule>, useRealLSP: boolean = false) {
    this.expectationBuilder = expectationBuilder;
    this.tokenMatcher = new TokenMatcher();
    this.fixSuggestionGenerator = new FixSuggestionGenerator();
    this.nodeTokenRules = nodeTokenRules;
    this.useRealLSP = useRealLSP;
  }

  /**
   * Validate a fixture's semantic token coverage
   */
  async validateFixture(fixture: FixtureData): Promise<ValidationResult> {
    const mode = this.inferMode(fixture);

    // Generate semantic tokens with diagnostics
    const { tokens, diagnostics } = await this.generateSemanticTokens(fixture.ast, fixture.input, fixture.name, fixture.templateType);

    // Build node expectations
    const expectations = this.expectationBuilder.buildExpectations(
      fixture.ast,
      mode,
      fixture.input,
      fixture.templateType
    );

    // Find gaps with diagnostic enrichment
    let gaps = this.findCoverageGaps(expectations, tokens, fixture.input, diagnostics);

    // Enhance gaps with fix suggestions
    gaps = this.fixSuggestionGenerator.enhanceGapsWithFixes(gaps);

    // Group by visitor
    const gapsByVisitor = this.fixSuggestionGenerator.groupByVisitor(gaps);

    // Only count error gaps in coverage percentage
    const errorGaps = gaps.filter(g => g.severity === 'error');

    return {
      fixturePath: fixture.name,
      mode,
      totalNodes: expectations.length,
      coveredNodes: expectations.length - errorGaps.length,
      gaps,
      gapsByVisitor,
      coveragePercentage: expectations.length > 0
        ? ((expectations.length - errorGaps.length) / expectations.length) * 100
        : 100
    };
  }

  /**
   * Generate semantic tokens for AST
   */
  private async generateSemanticTokens(
    ast: any[],
    input: string,
    fixtureName?: string,
    templateType?: 'att' | 'mtt'
  ): Promise<{ tokens: SemanticToken[]; diagnostics: DiagnosticContext }> {
    const { SemanticTokensBuilder } = await import('vscode-languageserver/node.js');
    const { TextDocument } = await import('vscode-languageserver-textdocument');
    const { ASTSemanticVisitor } = await import('../../../services/lsp/ASTSemanticVisitor.js');

    // Token type definitions (MUST MATCH language-server-impl.ts EXACTLY)
    const TOKEN_TYPES = [
      'keyword',          // 0
      'variable',         // 1
      'string',           // 2
      'operator',         // 3
      'label',            // 4
      'type',             // 5
      'parameter',        // 6
      'comment',          // 7
      'number',           // 8
      'property',         // 9
      'interface',        // 10
      'typeParameter',    // 11
      'namespace',        // 12
      'function',         // 13
      'modifier'          // 14 Definition directives
    ];

    // Token modifiers (MUST MATCH language-server-impl.ts EXACTLY)
    const TOKEN_MODIFIERS = [
      'declaration',      // 0
      'reference',        // 1
      'readonly',         // 2
      'interpolated',     // 3
      'literal',          // 4
      'invalid',          // 5
      'deprecated',       // 6
      'italic'            // 7
    ];

    // Token type map (MUST MATCH language-server-impl.ts EXACTLY)
    const TOKEN_TYPE_MAP: Record<string, string> = {
      'directive': 'keyword',
      'directiveDefinition': 'modifier',
      'directiveAction': 'property',
      'cmdLanguage': 'function',
      'variableRef': 'variable',
      'interpolation': 'variable',
      'template': 'operator',
      'templateContent': 'string',
      'embedded': 'property',
      'embeddedCode': 'string',
      'alligator': 'interface',
      'alligatorOpen': 'interface',
      'alligatorClose': 'interface',
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
      'property': 'property',
      'function': 'function',
      'label': 'label',
      'typeParameter': 'typeParameter',
      'interface': 'interface',
      'namespace': 'namespace',
      'modifier': 'modifier',
      'enum': 'enum'
    };

    // Create document with appropriate URI for template type detection
    let documentUri = 'test.mld';
    if (templateType === 'att') {
      documentUri = 'test.att';
    } else if (templateType === 'mtt') {
      documentUri = 'test.mtt';
    } else if (fixtureName) {
      // Use fixture name if it has an extension we recognize
      if (fixtureName.endsWith('.att') || fixtureName.endsWith('.mtt') || fixtureName.endsWith('.mld') || fixtureName.endsWith('.mld.md')) {
        documentUri = fixtureName;
      }
    }
    const document = TextDocument.create(documentUri, 'mlld', 1, input);

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

    const diagnostics: DiagnosticContext = {
      visitorCalls: visitor.getVisitorDiagnostics(),
      tokenAttempts: visitor.getTokenBuilder().getAttempts(),
      nodeTraversalPath: [],
      contextState: {}
    };

    return { tokens, diagnostics };
  }

  /**
   * Find coverage gaps
   */
  private findCoverageGaps(
    expectations: NodeExpectation[],
    tokens: SemanticToken[],
    input: string,
    diagnostics: DiagnosticContext
  ): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    for (const expectation of expectations) {
      const overlappingTokens = this.tokenMatcher.findOverlappingTokens(
        tokens,
        expectation.location
      );

      const rule = this.nodeTokenRules.get(expectation.nodeType);
      const requireExactType = rule?.requireExactType ?? false;

      if (expectation.mustBeCovered && overlappingTokens.length === 0) {
        const gap = this.createGap(expectation, [], input, 'error');
        gap.diagnostic = this.buildDiagnosticForNode(expectation.nodeId, expectation.nodeType, diagnostics);
        gaps.push(gap);
      } else if (
        overlappingTokens.length > 0 &&
        !this.tokenMatcher.tokensMatchExpectation(overlappingTokens, expectation)
      ) {
        const severity = requireExactType ? 'error' : 'warning';
        const gap = this.createGap(expectation, overlappingTokens, input, severity);
        gap.diagnostic = this.buildDiagnosticForNode(expectation.nodeId, expectation.nodeType, diagnostics);
        gaps.push(gap);
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
    input: string,
    severity: 'error' | 'warning'
  ): CoverageGap {
    const text = expectation.text ||
      this.tokenMatcher.extractText(input, expectation.location);

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
   * Build diagnostic context for a specific node
   */
  private buildDiagnosticForNode(
    nodeId: string,
    nodeType: string,
    diagnostics: DiagnosticContext
  ): DiagnosticContext {
    const relevantVisitorCalls = diagnostics.visitorCalls.filter(v => v.nodeId === nodeId);
    const relevantAttempts = diagnostics.tokenAttempts.filter(a => a.sourceNode === nodeId);

    return {
      visitorCalls: relevantVisitorCalls,
      tokenAttempts: relevantAttempts,
      nodeTraversalPath: diagnostics.nodeTraversalPath,
      contextState: diagnostics.contextState
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
