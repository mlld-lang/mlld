// Prism.js language definition for mlld
// Supports both strict mode (.mld) and prose mode (.mld.md)

const Prism = require('prismjs');

Prism.languages.mlld = {
  // Comments: >> to end of line, or << end-of-line comments
  'comment': [
    {
      pattern: />>.*$/m,
      greedy: true
    },
    {
      pattern: /<<.*$/m,
      greedy: true
    }
  ],

  // Backtick template strings with variable interpolation
  'string-interpolated': {
    pattern: /`[^`]*`/,
    greedy: true,
    inside: {
      'variable': /@[\w.]+(?:\([^)]*\))?/,
      'punctuation': /`/
    }
  },

  // Double-quoted strings
  'string': {
    pattern: /"(?:[^"\\]|\\.)*"/,
    greedy: true,
    inside: {
      'variable': /@[\w.]+/
    }
  },

  // Command blocks: cmd { }, sh { }, bash { }, js { }, node { }, python { }
  'command-block': {
    pattern: /\b(cmd|sh|bash|js|node|python)(?::[^\s{]+)?\s*\{[^}]*\}/,
    greedy: true,
    inside: {
      'command-type': {
        pattern: /^(cmd|sh|bash|js|node|python)/,
        alias: 'keyword'
      },
      'working-dir': {
        pattern: /:[^\s{]+/,
        alias: 'string'
      },
      'punctuation': /[{}]/,
      'variable': /@[\w.]+/
    }
  },

  // File loading with angle brackets: <path>, <glob>, <file # Section>
  'file-load': {
    pattern: /<[^>]+>/,
    greedy: true,
    inside: {
      'section': {
        pattern: /#\s*.+$/,
        alias: 'string'
      },
      'ast-selector': {
        pattern: /\{[^}]+\}/,
        alias: 'function'
      },
      'punctuation': /[<>]/,
      'path': {
        pattern: /[^<>#{}]+/,
        alias: 'string'
      }
    }
  },

  // Directives - both with and without / prefix
  'directive': {
    pattern: /^\s*\/?(?:var|exe|show|run|guard|export|import|for|when|while|stream|output|append|log|path|template)\b/m,
    alias: 'keyword'
  },

  // Block keywords (inside [...] blocks)
  'block-keyword': {
    pattern: /\b(?:let|done|continue|skip)\b/,
    alias: 'keyword'
  },

  // Control flow keywords
  'control-keyword': {
    pattern: /\b(?:first|parallel|in|from|as|with|to|before|after|always|allow|deny|retry|none|untrusted|cached|live|static|module|local)\b/,
    alias: 'keyword'
  },

  // When block
  'when-keyword': {
    pattern: /\bwhen\b/,
    alias: 'keyword'
  },

  // Arrow operator for returns and when arms
  'arrow': {
    pattern: /=>/,
    alias: 'operator'
  },

  // Parallel operator
  'parallel-op': {
    pattern: /\|\|/,
    alias: 'operator'
  },

  // Pipe operator
  'pipe': {
    pattern: /\|(?!\|)/,
    alias: 'operator'
  },

  // Wildcard in when blocks
  'wildcard': {
    pattern: /(?<=^|\s)\*(?=\s|$|=>)/m,
    alias: 'keyword'
  },

  // Reserved/builtin variables
  'builtin-variable': {
    pattern: /@(?:mx|fm|debug|json|md|stdin)\b/,
    alias: 'builtin'
  },

  // Function/executable calls: @name(args)
  'function-call': {
    pattern: /@[\w]+(?:\.[\w]+)*\s*\(/,
    greedy: true,
    inside: {
      'function': {
        pattern: /@[\w]+(?:\.[\w]+)*/,
        alias: 'function'
      },
      'punctuation': /\(/
    }
  },

  // Variables with field access: @var.field.subfield
  'variable': {
    pattern: /@[\w]+(?:\.[\w]+)*/,
    alias: 'variable'
  },

  // Method calls: .method()
  'method-call': {
    pattern: /\.[\w]+\s*\(/,
    inside: {
      'method': {
        pattern: /\.[\w]+/,
        alias: 'function'
      },
      'punctuation': /\(/
    }
  },

  // Object keys in literals: key:
  'object-key': {
    pattern: /(?<=^|[{,\s])[\w]+(?=\s*:(?!:))/m,
    alias: 'property'
  },

  // Assignment operators
  'assignment-operator': {
    pattern: /\+?=/,
    alias: 'operator'
  },

  // Comparison operators
  'comparison-operator': {
    pattern: /[<>]=?|[!=]=|&&|\|\||!/,
    alias: 'operator'
  },

  // Ternary operator
  'ternary-operator': {
    pattern: /\?(?!`|")/,
    alias: 'operator'
  },

  // Nullish coalescing
  'nullish': {
    pattern: /\?\?/,
    alias: 'operator'
  },

  // Numbers
  'number': /\b\d+(?:\.\d+)?\b/,

  // Booleans
  'boolean': /\b(?:true|false)\b/,

  // Null
  'null': /\bnull\b/,

  // Punctuation
  'punctuation': /[{}()\[\],;:]/
};

// Also register as .mld
Prism.languages.mld = Prism.languages.mlld;
