/**
 * Type definitions for the AST-driven semantic token validator
 */

import type { SourceLocation } from '../../../core/types/primitives.js';

export interface NodeExpectation {
  nodeId: string;
  nodeType: string;
  location: SourceLocation;
  expectedTokenTypes: string[];
  mustBeCovered: boolean;
  context: ValidationContext;
  text?: string;
}

export interface ValidationContext {
  inTemplate: boolean;
  templateType?: 'backtick' | 'doubleColon' | 'tripleColon' | 'att' | 'mtt';
  inCommand: boolean;
  commandLanguage?: string;
  parentNodeType?: string;
  mode: 'strict' | 'markdown';
}

export interface SemanticToken {
  line: number;
  char: number;
  length: number;
  tokenType: string;
  modifiers?: string[];
}

export interface TokenAttempt {
  tokenType: string;
  position: { line: number; char: number; length: number };
  accepted: boolean;
  rejectionReason?: 'invalid_position' | 'negative_position' | 'duplicate' | 'unknown_type' | 'nan_value';
  sourceNode?: string;
  callerInfo?: string;
}

export interface VisitorDiagnostic {
  visitorClass: string;
  nodeType: string;
  nodeId: string;
  called: boolean;
  tokensEmitted: number;
  tokensAccepted: number;
  tokensRejected: number;
}

export interface DiagnosticContext {
  visitorCalls: VisitorDiagnostic[];
  tokenAttempts: TokenAttempt[];
  nodeTraversalPath: string[];
  contextState: any;
}

export interface CoverageGap {
  nodeId: string;
  nodeType: string;
  location: SourceLocation;
  expectedTokenTypes: string[];
  actualTokens: SemanticToken[];
  severity: 'error' | 'warning';
  text: string;
  fix: FixSuggestion;
  diagnostic?: DiagnosticContext;
}

export interface FixSuggestion {
  visitorClass: string;
  visitorFile: string;
  suggestedMethod?: string;
  helperClass?: string;
  codeExample: string;
}

export interface ValidationResult {
  fixturePath: string;
  mode: 'strict' | 'markdown';
  totalNodes: number;
  coveredNodes: number;
  gaps: CoverageGap[];
  gapsByVisitor: Map<string, CoverageGap[]>;
  coveragePercentage: number;
}

export interface NodeTokenRule {
  expectedTokenTypes: string[] | ((node: any, context: ValidationContext) => string[]);
  mustBeCovered?: boolean;
  requireExactType?: boolean;
  visitor?: string;
  skipValidation?: boolean;
  isStructural?: boolean;
  includeAtSign?: boolean;
  includeOperator?: boolean;
}

export interface OperatorExpectation {
  operator: string;
  tokenType: string;
  contexts: string[];
  findBetween?: {
    leftNodeType: string | string[];
    rightNodeType: string | string[];
  };
}

export interface VisitorInfo {
  class: string;
  file: string;
  helper?: string;
}

export interface FixtureData {
  name: string;
  input: string;
  ast: any[];
  mlldMode?: 'strict' | 'markdown';
  expected?: string;
  expectedError?: string;
  templateType?: 'att' | 'mtt';
}
