/**
 * Token Validator - AST-driven semantic token coverage validation
 */

export { TokenCoverageValidator } from './TokenCoverageValidator.js';
export { NodeExpectationBuilder } from './NodeExpectationBuilder.js';
export { TokenMatcher } from './TokenMatcher.js';
export { FixSuggestionGenerator } from './FixSuggestionGenerator.js';
export { VisitorMapper } from './VisitorMapper.js';
export { OperatorDetector } from './OperatorDetector.js';
export { ContextBuilder } from './ContextBuilder.js';
export { CoverageReporter } from './CoverageReporter.js';
export { createNodeTokenRuleMap, getNodeTokenRule, NODE_TOKEN_RULES } from './NodeTokenMap.js';

export type {
  NodeExpectation,
  ValidationContext,
  SemanticToken,
  CoverageGap,
  FixSuggestion,
  ValidationResult,
  NodeTokenRule,
  OperatorExpectation,
  VisitorInfo,
  FixtureData
} from './types.js';
