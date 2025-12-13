/**
 * NodeTokenMap - Defines expected tokens for each AST node type
 * This is the "brain" of the validator - it knows what each node should generate
 */

import type { NodeTokenRule, ValidationContext } from './types.js';

/**
 * Core node type to token mapping rules
 *
 * Rules define:
 * - expectedTokenTypes: What token types should cover this node
 * - mustBeCovered: Whether missing tokens are an error
 * - visitor: Which visitor class is responsible
 * - skipValidation: Whether to skip this node type entirely
 * - isStructural: Whether this is structural syntax (delimiters)
 */
export const NODE_TOKEN_RULES: Record<string, NodeTokenRule> = {
  // =============================================================================
  // DIRECTIVES - Always need keyword tokens
  // =============================================================================
  'VarDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'ShowDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'RunDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'ExeDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'WhenDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'ForDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'ImportDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'ExportDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'PathDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'OutputDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'AppendDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'GuardDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'WhileDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },
  'StreamDirective': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'DirectiveVisitor'
  },

  // =============================================================================
  // VARIABLES - Can be variable or function (when used in function calls)
  // =============================================================================
  'VariableReference': {
    expectedTokenTypes: ['variable', 'function'],
    mustBeCovered: true,
    includeAtSign: true,
    visitor: 'VariableVisitor'
  },
  'VariableDeclaration': {
    expectedTokenTypes: ['variable'],
    mustBeCovered: true,
    includeAtSign: true,
    visitor: 'VariableVisitor'
  },

  // =============================================================================
  // LITERALS - Token type depends on value type
  // =============================================================================
  'Literal': {
    expectedTokenTypes: (node: any) => {
      // Special keyword-like literals
      if (node.valueType === 'wildcard' || node.valueType === 'none' || node.valueType === 'retry') return ['keyword'];
      if (node.valueType === 'done' || node.valueType === 'continue') return ['keyword'];
      if (node.valueType === 'number') return ['number'];
      if (node.valueType === 'boolean') return ['keyword'];
      if (node.value === null) return ['keyword'];
      if (node.valueType === 'string') return ['string'];
      return ['variable'];
    },
    mustBeCovered: true,
    visitor: 'LiteralVisitor'
  },

  // =============================================================================
  // PARAMETERS - Function/exe parameters
  // =============================================================================
  'Parameter': {
    expectedTokenTypes: ['parameter'],
    mustBeCovered: true,
    visitor: 'FileReferenceVisitor'
  },

  // =============================================================================
  // COMMENTS - Always need comment tokens
  // =============================================================================
  'Comment': {
    expectedTokenTypes: ['comment'],
    mustBeCovered: true,
    visitor: 'FileReferenceVisitor'
  },

  // =============================================================================
  // TEXT NODES - Context-aware (only in templates)
  // =============================================================================
  'Text': {
    expectedTokenTypes: (node: any, context: ValidationContext) => {
      if (context.inTemplate) return ['string'];
      return []; // Plain markdown text doesn't need tokens
    },
    mustBeCovered: false,
    visitor: 'TemplateVisitor'
  },

  // =============================================================================
  // FIELD ACCESS - Property access needs tokens
  // =============================================================================
  'FieldAccessNode': {
    expectedTokenTypes: ['property'],
    mustBeCovered: true,
    includeOperator: true,
    visitor: 'StructureVisitor'
  },
  'field': {
    // Fields can be properties (.name) or methods (.indexOf)
    // Method calls in ExecInvocation tokenize as 'function'
    expectedTokenTypes: ['property', 'function'],
    mustBeCovered: true,
    visitor: 'StructureVisitor'
  },
  'numericField': {
    expectedTokenTypes: ['property'],
    mustBeCovered: true,
    visitor: 'StructureVisitor'
  },
  'variableIndex': {
    // Bracket access like @templates[@key] - brackets are operators
    expectedTokenTypes: ['operator'],
    mustBeCovered: true,
    visitor: 'VariableVisitor'
  },

  // =============================================================================
  // EXPRESSIONS
  // =============================================================================
  'BinaryExpression': {
    expectedTokenTypes: ['operator'],
    mustBeCovered: true,
    visitor: 'ExpressionVisitor'
  },
  'UnaryExpression': {
    expectedTokenTypes: ['operator'],
    mustBeCovered: true,
    visitor: 'ExpressionVisitor'
  },
  'TernaryExpression': {
    expectedTokenTypes: ['operator'],
    mustBeCovered: true,
    visitor: 'ExpressionVisitor'
  },
  'WhenExpression': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'ExpressionVisitor'
  },
  'ForExpression': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'ExpressionVisitor'
  },

  // =============================================================================
  // EXEC/COMMAND
  // =============================================================================
  'ExecInvocation': {
    expectedTokenTypes: ['function'],
    mustBeCovered: true,
    visitor: 'CommandVisitor'
  },
  'CommandBlock': {
    expectedTokenTypes: ['string'],
    mustBeCovered: false, // Content depends on language
    visitor: 'CommandVisitor'
  },

  // =============================================================================
  // STRUCTURAL NODES - Delimiters are OPTIONAL
  // =============================================================================
  'array': {
    expectedTokenTypes: [],
    mustBeCovered: false,
    isStructural: true
  },
  'object': {
    expectedTokenTypes: [],
    mustBeCovered: false,
    isStructural: true
  },
  'Property': {
    expectedTokenTypes: ['property'],
    mustBeCovered: true,
    visitor: 'StructureVisitor'
  },
  'MemberExpression': {
    expectedTokenTypes: ['property'],
    mustBeCovered: true,
    visitor: 'StructureVisitor'
  },

  // =============================================================================
  // CONTROL FLOW KEYWORDS
  // =============================================================================
  'done': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'LiteralVisitor'
  },
  'continue': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'LiteralVisitor'
  },

  // =============================================================================
  // FILE REFERENCES & SECTIONS
  // =============================================================================
  'AlligatorExpression': {
    expectedTokenTypes: ['interface', 'operator'],
    mustBeCovered: true,
    visitor: 'FileReferenceVisitor'
  },
  'SectionMarker': {
    expectedTokenTypes: ['namespace'],
    mustBeCovered: true,
    visitor: 'FileReferenceVisitor'
  },

  // =============================================================================
  // FRONTMATTER & CODE FENCES
  // =============================================================================
  'Frontmatter': {
    expectedTokenTypes: [],
    mustBeCovered: false,
    visitor: 'FileReferenceVisitor'
  },
  'CodeFence': {
    expectedTokenTypes: [],
    mustBeCovered: false,
    visitor: 'FileReferenceVisitor'
  },

  // =============================================================================
  // SEPARATORS - Skip validation
  // =============================================================================
  'Newline': {
    expectedTokenTypes: [],
    skipValidation: true
  },
  'DotSeparator': {
    expectedTokenTypes: [],
    skipValidation: true
  },
  'PathSeparator': {
    expectedTokenTypes: [],
    skipValidation: true
  },

  // =============================================================================
  // TEMPLATES
  // =============================================================================
  'StringLiteral': {
    expectedTokenTypes: (node: any, context: ValidationContext) => {
      if (node.meta?.wrapperType === 'singleQuote') {
        return ['string']; // Single quotes are literal
      }
      return ['string', 'operator']; // Template delimiters + content
    },
    mustBeCovered: true,
    visitor: 'TemplateVisitor'
  },
  'TemplateForBlock': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'TemplateVisitor'
  },
  'TemplateInlineShow': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'TemplateVisitor'
  },

  // =============================================================================
  // BLOCK STATEMENTS (let, =>, etc.)
  // =============================================================================
  'LetAssignment': {
    expectedTokenTypes: ['keyword'],
    mustBeCovered: true,
    visitor: 'ExpressionVisitor'
  },
  'ExeReturn': {
    expectedTokenTypes: ['operator'],
    mustBeCovered: true,
    visitor: 'ExpressionVisitor'
  },

  // =============================================================================
  // ERROR NODES
  // =============================================================================
  'Error': {
    expectedTokenTypes: [],
    skipValidation: true
  }
};

/**
 * Get node token rule, with fallback for unknown types
 */
export function getNodeTokenRule(nodeType: string): NodeTokenRule {
  return NODE_TOKEN_RULES[nodeType] || {
    expectedTokenTypes: [],
    mustBeCovered: false,
    visitor: 'UnknownVisitor'
  };
}

/**
 * Create a map from the rules for efficient lookup
 */
export function createNodeTokenRuleMap(): Map<string, NodeTokenRule> {
  const map = new Map<string, NodeTokenRule>();

  for (const [nodeType, rule] of Object.entries(NODE_TOKEN_RULES)) {
    map.set(nodeType, rule);
  }

  return map;
}
