// Auto-generated Prism.js language definition for Mlld
// Generated from grammar at 2025-07-31T00:49:58.477Z

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
        pattern: /@(INPUT|TIME|PROJECTPATH|DEBUG|input|time|projectpath|debug|Input|Time|ProjectPath|Debug|STDIN|stdin|Stdin|now|NOW|base)\b/,
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
        pattern: /@(INPUT|TIME|PROJECTPATH|DEBUG|input|time|projectpath|debug|Input|Time|ProjectPath|Debug|STDIN|stdin|Stdin|now|NOW|base)\b/,
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
        pattern: /@(INPUT|TIME|PROJECTPATH|DEBUG|input|time|projectpath|debug|Input|Time|ProjectPath|Debug|STDIN|stdin|Stdin|now|NOW|base)\b/,
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
  'alligator': {
    pattern: /<[^>]*[\.\/\*@][^>]*>/,
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
