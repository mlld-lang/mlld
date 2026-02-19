/**
 * Shared Highlighting Rules for mlld
 * 
 * This module defines the highlighting rules that are shared between
 * the LSP semantic tokens, TextMate grammars, and other syntax highlighting
 * implementations.
 */

export interface InterpolationRule {
  pattern: 'variable' | 'alligator' | 'mustache';
  prefix?: string;
  wrapper?: string;
  markers?: string[];
}

export interface TemplateRule {
  delimiter: string;
  interpolates: InterpolationRule[];
  literalOnly?: boolean;
  xmlEnabled?: boolean;
}

export interface HighlightingRules {
  templates: Record<string, TemplateRule>;
  operators: Record<string, string[]>;
  directives: {
    current: string[];
    deprecated: string[];
  };
  keywords: {
    commands: string[];
    languages: string[];
    special: string[];
  };
}

export const HIGHLIGHTING_RULES: HighlightingRules = {
  templates: {
    backtick: {
      delimiter: '`',
      interpolates: [
        { pattern: 'variable', prefix: '@' },
        { pattern: 'alligator', markers: ['.', '/', '*', '@'] }
      ]
    },
    doubleColon: {
      delimiter: '::',
      interpolates: [
        { pattern: 'variable', prefix: '@' },
        { pattern: 'alligator', markers: ['.', '/', '*', '@'] }
      ]
    },
    tripleColon: {
      delimiter: ':::',
      interpolates: [
        { pattern: 'mustache', wrapper: '{{}}' }
      ],
      xmlEnabled: true
    },
    doubleQuote: {
      delimiter: '"',
      interpolates: [
        { pattern: 'variable', prefix: '@' },
        { pattern: 'alligator', markers: ['.', '/', '*', '@'] }
      ]
    },
    singleQuote: {
      delimiter: "'",
      literalOnly: true
    }
  },
  
  operators: {
    logical: ['&&', '||', '!'],
    comparison: ['==', '!=', '<', '>', '<=', '>='],
    ternary: ['?', ':'],
    pipe: ['|'],
    assignment: ['='],
    arrow: ['=>']
  },
  
  directives: {
    current: ['var', 'show', 'run', 'exe', 'env', 'import', 'when', 'if', 'output', 'path', 'hook'],
    deprecated: ['text', 'data', 'add', 'exec']
  },
  
  keywords: {
    commands: ['run', 'sh'],
    languages: ['js', 'node', 'python', 'bash'],
    special: ['when', 'if', 'else', 'first', 'all', 'any', 'foreach', 'from', 'as', 'to', 'with', 'new', 'node']
  }
} as const;

/**
 * Determines if a given text should be treated as an interpolation
 * in the specified template context.
 */
export function shouldInterpolate(
  templateType: keyof typeof HIGHLIGHTING_RULES.templates,
  text: string
): { interpolates: boolean; pattern?: InterpolationRule['pattern'] } {
  const template = HIGHLIGHTING_RULES.templates[templateType];
  if (!template || template.literalOnly) {
    return { interpolates: false };
  }
  
  for (const rule of template.interpolates) {
    switch (rule.pattern) {
      case 'variable':
        if (rule.prefix && text.startsWith(rule.prefix)) {
          return { interpolates: true, pattern: 'variable' };
        }
        break;
        
      case 'alligator':
        if (text.startsWith('<') && text.endsWith('>') && rule.markers) {
          const inner = text.slice(1, -1);
          if (rule.markers.some(marker => inner.includes(marker))) {
            return { interpolates: true, pattern: 'alligator' };
          }
        }
        break;
        
      case 'mustache':
        if (rule.wrapper === '{{}}' && text.startsWith('{{') && text.endsWith('}}')) {
          return { interpolates: true, pattern: 'mustache' };
        }
        break;
    }
  }
  
  return { interpolates: false };
}

/**
 * Checks if a text represents an XML tag in the given context.
 * Only relevant for triple-colon templates.
 */
export function isXMLTag(templateType: string, text: string): boolean {
  const template = HIGHLIGHTING_RULES.templates[templateType];
  if (!template?.xmlEnabled) return false;
  
  // Basic XML tag pattern: <tag>, </tag>, <tag_name>
  if (text.startsWith('<') && text.endsWith('>')) {
    let inner = text.slice(1, -1);
    
    // Handle closing tags
    if (inner.startsWith('/')) {
      inner = inner.slice(1);
    }
    
    // If it contains special chars that make it a file reference, it's not XML
    // Note: / is allowed for closing tags, so we check the inner content after removing /
    if (['.', '*', '@'].some(char => inner.includes(char)) || inner.includes('/')) {
      return false;
    }
    
    // Otherwise, it's an XML tag
    return true;
  }
  
  return false;
}

/**
 * Gets the appropriate semantic token type for a given AST node
 * based on its context.
 */
export function getSemanticTokenType(
  nodeType: string,
  context: { templateType?: string; interpolationAllowed?: boolean }
): string | null {
  // Map AST node types to semantic token types
  const nodeTypeMap: Record<string, string> = {
    'Directive': 'directive',
    'VariableReference': context.interpolationAllowed ? 'interpolation' : 'variableRef',
    'Comment': 'comment',
    'StringLiteral': 'string',
    'FileReference': context.templateType === 'tripleColon' ? 'xmlTag' : 'alligator',
    'BinaryExpression': 'operator',
    'UnaryExpression': 'operator',
    'NewExpression': 'keyword',
    'Literal': 'literal'
  };
  
  return nodeTypeMap[nodeType] || null;
}
