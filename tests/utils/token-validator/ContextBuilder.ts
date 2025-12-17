/**
 * ContextBuilder - Tracks validation context as we walk the AST
 */

import type { ValidationContext } from './types.js';

export class ContextBuilder {
  /**
   * Update context based on current node
   */
  updateContext(node: any, parentContext: ValidationContext): ValidationContext {
    const mx = { ...parentContext };

    // Template context
    if (this.isTemplateNode(node)) {
      mx.inTemplate = true;
      mx.templateType = this.getTemplateType(node);
    }

    // Command context
    if (this.isCommandNode(node)) {
      mx.inCommand = true;
      mx.commandLanguage = this.getCommandLanguage(node);
    }

    // Track parent node type
    mx.parentNodeType = node.type;

    return mx;
  }

  /**
   * Check if node is a template
   */
  private isTemplateNode(node: any): boolean {
    if (node.type === 'StringLiteral' && node.meta?.wrapperType) {
      return true;
    }

    return false;
  }

  /**
   * Get template type from node
   */
  private getTemplateType(
    node: any
  ): 'backtick' | 'doubleColon' | 'tripleColon' | undefined {
    if (node.type !== 'StringLiteral' || !node.meta?.wrapperType) {
      return undefined;
    }

    const wrapperType = node.meta.wrapperType;

    if (wrapperType === 'backtick') return 'backtick';
    if (wrapperType === 'doubleColon') return 'doubleColon';
    if (wrapperType === 'tripleColon') return 'tripleColon';

    return undefined;
  }

  /**
   * Check if node is a command
   */
  private isCommandNode(node: any): boolean {
    return (
      node.type === 'CommandBlock' ||
      node.type === 'RunDirective' ||
      node.type === 'CommandReference'
    );
  }

  /**
   * Get command language from node
   */
  private getCommandLanguage(node: any): string | undefined {
    if (node.language) {
      if (Array.isArray(node.language)) {
        return node.language
          .map((part: any) => {
            if (typeof part === 'string') return part;
            if (part.type === 'Text') return part.content;
            return '';
          })
          .join('');
      }

      if (typeof node.language === 'string') {
        return node.language;
      }

      if (node.language.type === 'Text') {
        return node.language.content;
      }
    }

    return undefined;
  }

  /**
   * Check if we're in a specific template type
   */
  isInTemplateType(
    context: ValidationContext,
    templateType: 'backtick' | 'doubleColon' | 'tripleColon'
  ): boolean {
    return context.inTemplate && context.templateType === templateType;
  }

  /**
   * Check if variable interpolation is allowed in context
   */
  allowsInterpolation(context: ValidationContext): boolean {
    // All template types allow some form of interpolation
    if (context.inTemplate) {
      return true;
    }

    // Command blocks allow interpolation
    if (context.inCommand) {
      return true;
    }

    return false;
  }

  /**
   * Get variable style for context
   */
  getVariableStyle(context: ValidationContext): '@var' | '{{var}}' | null {
    if (!context.inTemplate) {
      return '@var'; // Default style outside templates
    }

    // Triple-colon uses {{var}} style
    if (context.templateType === 'tripleColon') {
      return '{{var}}';
    }

    // Backtick and double-colon use @var style
    if (context.templateType === 'backtick' || context.templateType === 'doubleColon') {
      return '@var';
    }

    return null;
  }
}
