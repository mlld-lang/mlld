// Auto-generated Prism.js language definition for Mlld
// Generated from grammar at 2025-05-28T00:19:45.654Z

Prism.languages.mlld = {
  'comment': {
    pattern: />>.*$/,
    greedy: true
  },
  'directive': {
    pattern: /@(data|text|run|add|path|import|exec)\b/,
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
  'operator': /\b(from|as)\b|=/,
  'number': /\b\d+(\.\d+)?\b/,
  'boolean': /\b(true|false)\b/,
  'null': /\bnull\b/,
  'punctuation': /[{}(),]/
};

// Also highlight .mlld and .mld files
Prism.languages.mld = Prism.languages.mlld;
