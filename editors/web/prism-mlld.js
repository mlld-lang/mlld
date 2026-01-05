// Auto-generated Prism.js language definition for Mlld
// Generated from grammar at 2026-01-04T19:35:55.750Z

const Prism = require('prismjs');

Prism.languages.mlld = {
  // Comment MUST be first to match >> before comparison operators grab individual >
  'comment': {
    pattern: /(?:>>|<<).*$/m,
    greedy: true
  },
  'directive': {
    pattern: /\b(var|show|stream|run|exe|path|import|when|output|append|for|log|guard|export|policy)\b/,
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
        pattern: /@\w+/
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
        pattern: /@\w+/
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
        pattern: /@\w+/
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
  // Block keywords (let, done, continue, skip)
  'block-keyword': {
    pattern: /\b(let|done|continue|skip)\b/,
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
    pattern: /@\w+/,
    alias: 'variable'
  },
  'field-access': {
    pattern: /\.(\w+|\d+)/,
    alias: 'property'
  },
  'operator': /\b(from|as|foreach|with|to|format|parallel|before|after|always|allow|deny|retry|stream|module|static|live|cached|local|cmd|in|for|first|none|untrusted)\b/,
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
