// Auto-generated Prism.js language definition for Mlld
// Generated from grammar at 2025-07-29T05:57:27.526Z

const Prism = require('prismjs');

Prism.languages.mlld = {
  'comment': {
    pattern: /(>>|<<).*$/,
    greedy: true
  },
  'directive': {
    pattern: //(var|show|run|exe|path|import|when|output)\b/,
    alias: 'keyword'
  },
  'when-keyword': {
    pattern: /when\s*:/,
    alias: 'keyword'
  },
  'logical-operator': {
    pattern: /&&|\|\||!(?=@|\s|\()/,
    alias: 'operator'
  },
  'comparison-operator': {
    pattern: /(==|!=|<=|>=|<|>)/,
    alias: 'operator'
  },
  'arrow-operator': {
    pattern: /=>/,
    alias: 'operator'
  },
  'ternary-operator': {
    pattern: /[?:]/,
    alias: 'operator'
  },
  'triple-template-block': {
    pattern: /:::[^:]+:::/,
    greedy: true,
    inside: {
      'template-variable': {
        pattern: /\{\{[^}]+\}\}/,
        inside: {
          'punctuation': /\{\{|\}\}/,
          'variable': /[^{}]+/
        }
      },
      'punctuation': /:::/
    }
  },
  'template-block': {
    pattern: /::[^:]+::/,
    greedy: true,
    inside: {
      'template-variable': {
        pattern: /\{\{[^}]+\}\}/,
        inside: {
          'punctuation': /\{\{|\}\}/,
          'variable': /[^{}]+/
        }
      },
      'punctuation': /::/
    }
  },
  'alligator': {
    pattern: /<[^>]+>/,
    greedy: true,
    inside: {
      'url': {
        pattern: /https?:\/\/[^>]+/,
        alias: 'string'
      },
      'punctuation': /<|>/
    }
  },
  'path': {
    pattern: /\[[^\]]+\]/,
    greedy: true,
    inside: {
      'url': {
        pattern: /https?:\/\/[^\]]+/,
        alias: 'string'
      },
      'punctuation': /\[|\]/
    }
  },
  'string': {
    pattern: /"[^"]*"/,
    greedy: true
  },
  'reserved-variable': {
    pattern: /@(INPUT|TIME|PROJECTPATH|DEBUG|input|time|projectpath|debug|Input|Time|ProjectPath|Debug|STDIN|stdin|Stdin|now|NOW|base)\b/,
    alias: 'builtin'
  },
  'variable': {
    pattern: /@\w+/,
    alias: 'variable'
  },
  'field-access': {
    pattern: /\.(\w+|\d+)/,
    alias: 'property'
  },
  'operator': /\b(from|as|foreach|with|to)\b/,
  'pipe-operator': {
    pattern: /\|/,
    alias: 'operator'
  },
  'assignment-operator': {
    pattern: /=/,
    alias: 'operator'
  },
  'number': /\b\d+(\.\d+)?\b/,
  'boolean': /\b(true|false)\b/,
  'null': /\bnull\b/,
  'punctuation': /[{}(),]/
};

// Also highlight .mlld and .mld files
Prism.languages.mld = Prism.languages.mlld;

// Support for mlld-run code blocks
Prism.languages['mlld-run'] = Prism.languages.mlld;
