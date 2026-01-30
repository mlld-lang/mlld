/**
 * VisitorMapper - Maps AST node types to responsible visitor classes
 */

import type { VisitorInfo } from './types.js';

/**
 * Map of node types to visitor information
 */
const VISITOR_MAP: Record<string, VisitorInfo> = {
  // Directives
  'VarDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'ShowDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'RunDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'ExeDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'WhenDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'IfDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'ForDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'ImportDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'ExportDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'PathDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'OutputDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'AppendDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'GuardDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'WhileDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },
  'StreamDirective': {
    class: 'DirectiveVisitor',
    file: 'services/lsp/visitors/DirectiveVisitor.ts'
  },

  // Variables
  'VariableReference': {
    class: 'VariableVisitor',
    file: 'services/lsp/visitors/VariableVisitor.ts',
    helper: 'OperatorTokenHelper'
  },
  'VariableDeclaration': {
    class: 'VariableVisitor',
    file: 'services/lsp/visitors/VariableVisitor.ts'
  },

  // Literals
  'Literal': {
    class: 'LiteralVisitor',
    file: 'services/lsp/visitors/LiteralVisitor.ts'
  },

  // Parameters
  'Parameter': {
    class: 'FileReferenceVisitor',
    file: 'services/lsp/visitors/FileReferenceVisitor.ts'
  },

  // Comments
  'Comment': {
    class: 'FileReferenceVisitor',
    file: 'services/lsp/visitors/FileReferenceVisitor.ts',
    helper: 'CommentTokenHelper'
  },

  // Text
  'Text': {
    class: 'TemplateVisitor',
    file: 'services/lsp/visitors/TemplateVisitor.ts'
  },

  // Field Access
  'FieldAccessNode': {
    class: 'StructureVisitor',
    file: 'services/lsp/visitors/StructureVisitor.ts',
    helper: 'OperatorTokenHelper'
  },
  'field': {
    class: 'StructureVisitor',
    file: 'services/lsp/visitors/StructureVisitor.ts',
    helper: 'OperatorTokenHelper'
  },
  'numericField': {
    class: 'StructureVisitor',
    file: 'services/lsp/visitors/StructureVisitor.ts',
    helper: 'OperatorTokenHelper'
  },

  // Expressions
  'BinaryExpression': {
    class: 'ExpressionVisitor',
    file: 'services/lsp/visitors/ExpressionVisitor.ts',
    helper: 'OperatorTokenHelper'
  },
  'UnaryExpression': {
    class: 'ExpressionVisitor',
    file: 'services/lsp/visitors/ExpressionVisitor.ts',
    helper: 'OperatorTokenHelper'
  },
  'TernaryExpression': {
    class: 'ExpressionVisitor',
    file: 'services/lsp/visitors/ExpressionVisitor.ts',
    helper: 'OperatorTokenHelper'
  },
  'WhenExpression': {
    class: 'ExpressionVisitor',
    file: 'services/lsp/visitors/ExpressionVisitor.ts'
  },
  'ForExpression': {
    class: 'ExpressionVisitor',
    file: 'services/lsp/visitors/ExpressionVisitor.ts'
  },

  // Command
  'ExecInvocation': {
    class: 'CommandVisitor',
    file: 'services/lsp/visitors/CommandVisitor.ts'
  },
  'CommandBlock': {
    class: 'CommandVisitor',
    file: 'services/lsp/visitors/CommandVisitor.ts',
    helper: 'LanguageBlockHelper'
  },

  // Structure
  'Property': {
    class: 'StructureVisitor',
    file: 'services/lsp/visitors/StructureVisitor.ts'
  },
  'MemberExpression': {
    class: 'StructureVisitor',
    file: 'services/lsp/visitors/StructureVisitor.ts',
    helper: 'OperatorTokenHelper'
  },

  // Control Flow
  'done': {
    class: 'LiteralVisitor',
    file: 'services/lsp/visitors/LiteralVisitor.ts'
  },
  'continue': {
    class: 'LiteralVisitor',
    file: 'services/lsp/visitors/LiteralVisitor.ts'
  },

  // File References
  'AlligatorExpression': {
    class: 'FileReferenceVisitor',
    file: 'services/lsp/visitors/FileReferenceVisitor.ts'
  },
  'SectionMarker': {
    class: 'FileReferenceVisitor',
    file: 'services/lsp/visitors/FileReferenceVisitor.ts'
  },
  'Frontmatter': {
    class: 'FileReferenceVisitor',
    file: 'services/lsp/visitors/FileReferenceVisitor.ts'
  },
  'CodeFence': {
    class: 'FileReferenceVisitor',
    file: 'services/lsp/visitors/FileReferenceVisitor.ts'
  },

  // Templates
  'StringLiteral': {
    class: 'TemplateVisitor',
    file: 'services/lsp/visitors/TemplateVisitor.ts',
    helper: 'TemplateTokenHelper'
  },
  'TemplateForBlock': {
    class: 'TemplateVisitor',
    file: 'services/lsp/visitors/TemplateVisitor.ts'
  },
  'TemplateInlineShow': {
    class: 'TemplateVisitor',
    file: 'services/lsp/visitors/TemplateVisitor.ts'
  }
};

export class VisitorMapper {
  /**
   * Get visitor info for a node type
   */
  getVisitorInfo(nodeType: string): VisitorInfo {
    return VISITOR_MAP[nodeType] || {
      class: 'UnknownVisitor',
      file: ''
    };
  }

  /**
   * Get full file path for visitor
   */
  getVisitorFilePath(nodeType: string): string {
    const info = this.getVisitorInfo(nodeType);
    return info.file ? `/Users/adam/dev/mlld/${info.file}` : '';
  }

  /**
   * Get helper class for node type
   */
  getHelperClass(nodeType: string): string | undefined {
    const info = this.getVisitorInfo(nodeType);
    return info.helper;
  }

  /**
   * Check if node type has a known visitor
   */
  hasVisitor(nodeType: string): boolean {
    return nodeType in VISITOR_MAP;
  }
}
