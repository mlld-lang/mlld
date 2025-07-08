// Auto-generated Prism.js language definition for Mlld
// Generated from grammar at 2025-07-08T16:43:02.841Z

const Prism = require('prismjs');

Prism.languages.mlld = {
  'comment': {
    pattern: /(>>|<<).*$/,
    greedy: true
  },
  'directive': {
    pattern: /\/(var|show|run|exe|path|import|when|output)\b/,
    alias: 'keyword'
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
      'punctuation': /\[\[|\]\]/
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
    pattern: /@(INPUT|TIME|PROJECTPATH|DEBUG|input|time|projectpath|debug|Input|Time|ProjectPath|Debug|STDIN|stdin|Stdin)\b/,
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
  'number': /\b\d+(\.\d+)?\b/,
  'boolean': /\b(true|false)\b/,
  'null': /\bnull\b/,
  'punctuation': /[{}(),]/
};

// Also highlight .mlld and .mld files
Prism.languages.mld = Prism.languages.mlld;

// Support for mlld-run code blocks
Prism.languages['mlld-run'] = Prism.languages.mlld;
