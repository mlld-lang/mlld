// Auto-generated Prism.js language definition for Mlld
// Generated from grammar at 2025-06-04T17:11:06.580Z

const Prism = require('prismjs');

Prism.languages.mlld = {
  'comment': {
    pattern: /(>>|<<).*$/,
    greedy: true
  },
  'directive': {
    pattern: /@(data|text|run|add|path|import|exec|when|output)\b/,
    alias: 'keyword'
  },
  'template-block': {
    pattern: /\[\[([^\]\]]|\](?!\]))*\]\]/,
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
    pattern: /@(INPUT|TIME|PROJECTPATH|input|time|projectpath|Input|Time|ProjectPath|STDIN|stdin|Stdin)\b/,
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
