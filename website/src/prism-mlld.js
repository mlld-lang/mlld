// Auto-generated Prism.js language definition for Mlld
// Generated from grammar at 2026-02-19T22:20:35.265Z

const Prism = require('prismjs');

Prism.languages.mlld = {
  // Comment MUST be first to match >> before comparison operators grab individual >
  'comment': {
    pattern: /(?:>>|<<).*$/m,
    greedy: true
  },
  'directive': {
    pattern: /\b(var|show|stream|run|exe|import|when|if|output|append|for|loop|log|bail|checkpoint|guard|hook|export|policy|sign|verify|while|env)\b/,
    alias: 'keyword'
  },
  'when-keyword': {
    pattern: /when\s*:/,
    alias: 'keyword'
  },
  // Alligator MUST come before comparison operators to match <file.md> as one token
  'alligator': {
    pattern: /<[^>]*[\.\/@*][^>]*>/,
    greedy: true,
    inside: {
      'url': {
        pattern: /https?:\/\/[^>]+/,
        alias: 'string'
      },
      'punctuation': /<|>/
    }
  },
  // Arrow operator MUST come before comparison/assignment to match => as one token
  'arrow-operator': {
    pattern: /=>/,
    alias: 'operator'
  },
  'logical-operator': {
    pattern: /&&|\|\||!(?=@|\s|\()/,
    alias: 'operator'
  },
  'comparison-operator': {
    pattern: /(==|!=|<=|>=|<|>)/,
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
      // XML tags in triple-colon templates
      'xml-tag': {
        pattern: /<\/?[^>]+>/,
        alias: 'tag'
      },
      'punctuation': /:::/
    }
  },
  'template-block': {
    pattern: /::[^:]+::/,
    greedy: true,
    inside: {
      // Double-colon templates now use @var, not {{var}}
      'reserved-variable': {
        pattern: /@(INPUT|TIME|PROJECTPATH|DEBUG|LOCAL|HTTP|GITHUB|REGISTRY|input|time|projectpath|debug|stdin|now)\b/,
        alias: 'builtin'
      },
      'variable': {
        pattern: /@[A-Za-z_][A-Za-z0-9_-]*/
      },
      'alligator': {
        pattern: /<[^>]*[\.\/\*@][^>]*>/,
        inside: {
          'punctuation': /<|>/,
          'file-path': /[^<>]+/
        }
      },
      'punctuation': /::/
    }
  },
  'backtick-template': {
    pattern: /`[^`]*`/,
    greedy: true,
    inside: {
      'reserved-variable': {
        pattern: /@(INPUT|TIME|PROJECTPATH|DEBUG|LOCAL|HTTP|GITHUB|REGISTRY|input|time|projectpath|debug|stdin|now)\b/,
        alias: 'builtin'
      },
      'variable': {
        pattern: /@[A-Za-z_][A-Za-z0-9_-]*/
      },
      'alligator': {
        pattern: /<[^>]*[\.\/\*@][^>]*>/,
        inside: {
          'punctuation': /<|>/,
          'file-path': /[^<>]+/
        }
      },
      'punctuation': /`/
    }
  },
  // Double quotes with interpolation
  'string-interpolated': {
    pattern: /"[^"]*"/,
    greedy: true,
    inside: {
      'reserved-variable': {
        pattern: /@(INPUT|TIME|PROJECTPATH|DEBUG|LOCAL|HTTP|GITHUB|REGISTRY|input|time|projectpath|debug|stdin|now)\b/,
        alias: 'builtin'
      },
      'variable': {
        pattern: /@[A-Za-z_][A-Za-z0-9_-]*/
      },
      'alligator': {
        pattern: /<[^>]*[\.\/\*@][^>]*>/,
        inside: {
          'punctuation': /<|>/,
          'file-path': /[^<>]+/
        }
      },
      'punctuation': /"/
    }
  },
  // Single quotes - no interpolation
  'string-literal': {
    pattern: /'[^']*'/,
    greedy: true
  },
  // Block keywords (let, done, continue, skip, bail)
  'block-keyword': {
    pattern: /\b(let|done|continue|skip|bail)\b/,
    alias: 'keyword'
  },
  // Wildcard in when blocks
  'wildcard': {
    pattern: /(?:^|\s)\*(?=\s|$|=>)/m,
    alias: 'keyword'
  },
  // Object keys in literals (file:, review:, etc) - word followed by : but not ::
  'object-key': {
    pattern: /[\w]+(?=\s*:(?!:))/,
    greedy: true,
    alias: 'property'
  },
  'reserved-variable': {
    pattern: /@(INPUT|TIME|PROJECTPATH|DEBUG|LOCAL|HTTP|GITHUB|REGISTRY|input|time|projectpath|debug|stdin|now)\b/,
    alias: 'builtin'
  },
  'variable': {
    pattern: /@[A-Za-z_][A-Za-z0-9_-]*/,
    alias: 'variable'
  },
  'field-access': {
    pattern: /\.([A-Za-z_][A-Za-z0-9_-]*|\d+)/,
    alias: 'property'
  },
  'operator': /\b(from|as|foreach|with|to|format|parallel|before|after|always|allow|deny|retry|stream|module|static|live|cached|local|cmd|in|for|first|none|untrusted|node|new)\b/,
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
  'punctuation': /[{}()\[\],;:]/
};

// Also highlight .mlld and .mld files
Prism.languages.mld = Prism.languages.mlld;

// Support for mlld-run code blocks
Prism.languages['mlld-run'] = Prism.languages.mlld;
