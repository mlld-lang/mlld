// Auto-generated Prism.js language definition for Meld
// Generated from grammar at 2025-05-24T19:02:58.205Z

const Prism = require('prismjs');

Prism.languages.meld = {
  'comment': {
    pattern: />>.*$/,
    greedy: true
  },
  'directive': {
    pattern: /@(text|data|run|add|path|import|exec|define|embed|url)\b/,
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
  'variable': {
    pattern: /@\w+/,
    alias: 'variable'
  },
  'operator': /=|from|as/,
  'number': /\b\d+(\.\d+)?\b/,
  'boolean': /\b(true|false)\b/,
  'null': /\bnull\b/,
  'punctuation': /[{}(),]/
};

// Also highlight .meld and .mld files
Prism.languages.mld = Prism.languages.meld;
