#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MlldSyntaxGenerator {
  constructor() {
    // Extract directives from grammar
    this.directives = this.extractDirectivesFromGrammar();
    console.log('Found directives:', this.directives);
    
    // Define token patterns
    this.patterns = {
      directive: `(${this.directives.join('|')})\\b`,
      variable: '@\\w+',
      reservedVariable: '@(INPUT|TIME|PROJECTPATH|DEBUG|LOCAL|HTTP|GITHUB|REGISTRY|input|time|projectpath|debug|stdin|now)\\b',
      projectPathShort: '@\\.',
      negationOperator: '!@',
      fieldAccess: '\\.(\\w+|\\d+)',
      templateBlock: '::[^:]+::',  // Double-colon template syntax
      tripleColonTemplate: ':::[^:]+:::',  // Triple-colon template syntax
      templateVar: '\\{\\{[^}]+\\}\\}',
      backtickTemplate: '`[^`]*`',
      pathBrackets: '\\[[^\\]]+\\]',
      // Separate patterns for alligator vs XML
      alligatorExpression: '<[^>]*[\\.\\/\\*@][^>]*>',  // Must contain . / * or @
      alligatorWithSection: '<([^>#]+)(\\s*#\\s*)([^>]+)>',  // <file.md # Section>
      xmlTag: '</?\\w+>',  // Simple XML tags
      commandBraces: '\\{[^}]+\\}',  // Command syntax with braces
      languageKeyword: '\\b(javascript|js|node|nodejs|python|py|bash|sh)\\b',
      string: '"[^"]*"',
      singleQuoteString: "'[^']*'",
      comment: '(>>|<<).*$',
      // Logical operators
      logicalAnd: '&&',
      logicalOr: '\\|\\|',
      logicalNot: '!(?=@|\\s|\\()',
      // Comparison operators
      comparisonOps: '(==|!=|<=|>=|<|>)',
      // Ternary operators
      ternaryQuestion: '\\?',
      ternaryColon: ':',
      // When expression syntax
      whenKeyword: 'when\\s*:',
      whenArrow: '=>',
      // Enhanced operators list
      operators: '\\b(from|as|foreach|with|to|format|parallel)\\b',
      // Specific keywords
      parallelKeyword: '\\bparallel\\b',
      withFormatKey: '\\bformat\\b',
      // Pipe operator
      pipeOperator: '\\|',
      // Assignment operator
      assignmentOperator: '=',
      // Implicit assignment (for when blocks)
      implicitAssignment: '@\\w+\\s*=(?!=)',
      // Condensed pipes
      condensedPipe: '@\\w+(\\|@\\w+)+',
      filePipe: '<[^>]+>(\\|@\\w+)+',
      codeBlockDelimiter: '```\\w*',
      number: '\\b\\d+(\\.\\d+)?\\b',
      boolean: '\\b(true|false)\\b',
      null: '\\bnull\\b'
    };
  }

  extractDirectivesFromGrammar() {
    try {
      const grammarPath = path.join(__dirname, '../base/tokens.peggy');
      const grammar = fs.readFileSync(grammarPath, 'utf8');
      
      // Look for ReservedDirective rule
      const reservedMatch = grammar.match(/ReservedDirective[^=]*=([^$]+?)$/s);
      if (reservedMatch) {
        const directiveMatches = reservedMatch[1].match(/"\/(\w+)"/g);
        if (directiveMatches) {
          // Extract directive names without the / prefix
          const directives = directiveMatches.map(d => d.replace(/["\/]/g, ''));
          // Ensure newer directives are present even if grammar scan misses them
          ['for', 'log'].forEach(name => { if (!directives.includes(name)) directives.push(name); });
          return directives;
        }
      }
    } catch (err) {
      console.warn(`Could not read grammar file: ${err.message}`);
      console.warn('Using hardcoded directive list instead');
    }
    
    // Fallback to known list (v2 directives)
    return ['var', 'show', 'run', 'exe', 'path', 'import', 'when', 'output', 'for', 'log'];
  }

  generatePrism() {
    const prismLang = `// Auto-generated Prism.js language definition for Mlld
// Generated from grammar at ${new Date().toISOString()}

const Prism = require('prismjs');

Prism.languages.mlld = {
  'comment': {
    pattern: /${this.patterns.comment}/,
    greedy: true
  },
  'directive': {
    pattern: /${this.patterns.directive}/,
    alias: 'keyword'
  },
  'when-keyword': {
    pattern: /${this.patterns.whenKeyword}/,
    alias: 'keyword'
  },
  'logical-operator': {
    pattern: /${this.patterns.logicalAnd}|${this.patterns.logicalOr}|${this.patterns.logicalNot}/,
    alias: 'operator'
  },
  'comparison-operator': {
    pattern: /${this.patterns.comparisonOps}/,
    alias: 'operator'
  },
  'arrow-operator': {
    pattern: /${this.patterns.whenArrow}/,
    alias: 'operator'
  },
  'ternary-operator': {
    pattern: /[?:]/,
    alias: 'operator'
  },
  'triple-template-block': {
    pattern: /${this.patterns.tripleColonTemplate}/,
    greedy: true,
    inside: {
      'template-variable': {
        pattern: /${this.patterns.templateVar}/,
        inside: {
          'punctuation': /\\{\\{|\\}\\}/,
          'variable': /[^{}]+/
        }
      },
      // XML tags in triple-colon templates
      'xml-tag': {
        pattern: /<\\/?[^>]+>/,
        alias: 'tag'
      },
      'punctuation': /:::/
    }
  },
  'template-block': {
    pattern: /${this.patterns.templateBlock}/,
    greedy: true,
    inside: {
      // Double-colon templates now use @var, not {{var}}
      'reserved-variable': {
        pattern: /${this.patterns.reservedVariable}/,
        alias: 'builtin'
      },
      'variable': {
        pattern: /${this.patterns.variable}/
      },
      'alligator': {
        pattern: /${this.patterns.alligatorExpression}/,
        inside: {
          'punctuation': /<|>/,
          'file-path': /[^<>]+/
        }
      },
      'punctuation': /::/
    }
  },
  'backtick-template': {
    pattern: /${this.patterns.backtickTemplate}/,
    greedy: true,
    inside: {
      'reserved-variable': {
        pattern: /${this.patterns.reservedVariable}/,
        alias: 'builtin'
      },
      'variable': {
        pattern: /${this.patterns.variable}/
      },
      'alligator': {
        pattern: /${this.patterns.alligatorExpression}/,
        inside: {
          'punctuation': /<|>/,
          'file-path': /[^<>]+/
        }
      },
      'punctuation': /\`/
    }
  },
  // Double quotes with interpolation
  'string-interpolated': {
    pattern: /${this.patterns.string}/,
    greedy: true,
    inside: {
      'reserved-variable': {
        pattern: /${this.patterns.reservedVariable}/,
        alias: 'builtin'
      },
      'variable': {
        pattern: /${this.patterns.variable}/
      },
      'alligator': {
        pattern: /${this.patterns.alligatorExpression}/,
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
    pattern: /${this.patterns.singleQuoteString}/,
    greedy: true
  },
  'alligator': {
    pattern: /${this.patterns.alligatorExpression}/,
    greedy: true,
    inside: {
      'url': {
        pattern: /https?:\\/\\/[^>]+/,
        alias: 'string'
      },
      'punctuation': /<|>/
    }
  },
  'path': {
    pattern: /${this.patterns.pathBrackets}/,
    greedy: true,
    inside: {
      'url': {
        pattern: /https?:\\/\\/[^\\]]+/,
        alias: 'string'
      },
      'punctuation': /\\[|\\]/
    }
  },
  'reserved-variable': {
    pattern: /${this.patterns.reservedVariable}/,
    alias: 'builtin'
  },
  'variable': {
    pattern: /${this.patterns.variable}/,
    alias: 'variable'
  },
  'field-access': {
    pattern: /${this.patterns.fieldAccess}/,
    alias: 'property'
  },
  'operator': /${this.patterns.operators}/,
  'pipe-operator': {
    pattern: /${this.patterns.pipeOperator}/,
    alias: 'operator'
  },
  'assignment-operator': {
    pattern: /${this.patterns.assignmentOperator}/,
    alias: 'operator'
  },
  'number': /${this.patterns.number}/,
  'boolean': /${this.patterns.boolean}/,
  'null': /${this.patterns.null}/,
  'punctuation': /[{}(),]/
};

// Also highlight .mlld and .mld files
Prism.languages.mld = Prism.languages.mlld;

// Support for mlld-run code blocks
Prism.languages['mlld-run'] = Prism.languages.mlld;
`;
    
    return prismLang;
  }

  generateTextMate() {
    // For .mlld files, we treat them as Markdown with embedded mlld
    const textmate = {
      name: 'Mlld',
      scopeName: 'source.mlld',
      fileTypes: ['mlld', 'mld'],
      patterns: [
        // Full-line comments
        {
          name: 'comment.line.mlld',
          match: '^\\s*(>>|<<).*$'
        },
        // Global patterns that should be recognized everywhere
        {
          name: 'variable.language.reserved.mlld',
          match: this.patterns.reservedVariable
        },
        {
          name: 'variable.other.mlld',
          match: this.patterns.variable
        },
        {
          name: 'string.template.triple.mlld',
          begin: ':::',
          end: ':::',
          beginCaptures: {
            0: { name: 'punctuation.definition.template.triple.begin.mlld' }
          },
          endCaptures: {
            0: { name: 'punctuation.definition.template.triple.end.mlld' }
          },
          patterns: [
            {
              name: 'variable.template.mlld',
              begin: '\\{\\{',
              end: '\\}\\}',
              beginCaptures: {
                0: { name: 'punctuation.definition.template.variable.begin.mlld' }
              },
              endCaptures: {
                0: { name: 'punctuation.definition.template.variable.end.mlld' }
              },
              patterns: [
                {
                  name: 'variable.other.interpolation.mlld',
                  match: '[^}]+'
                }
              ]
            },
            {
              name: 'entity.name.tag.xml.mlld',
              match: '</?[^>]+>'
            }
          ]
        },
        {
          name: 'string.template.mlld',
          begin: '::',
          end: '::',
          beginCaptures: {
            0: { name: 'punctuation.definition.template.begin.mlld' }
          },
          endCaptures: {
            0: { name: 'punctuation.definition.template.end.mlld' }
          },
          patterns: [
            {
              name: 'variable.language.reserved.mlld',
              match: this.patterns.reservedVariable
            },
            {
              name: 'variable.other.mlld',
              match: this.patterns.variable
            },
            {
              name: 'string.interpolated.alligator.mlld',
              match: this.patterns.alligatorExpression
            }
          ]
        },
        {
          name: 'string.interpolated.alligator.mlld',
          match: this.patterns.alligatorExpression
        },
        // Match lines that start with valid mlld directives
        {
          name: 'meta.embedded.mlld',
          begin: `^(?=/(${this.directives.join('|')})\\b)`,
          end: '$',
          patterns: [
            // First pattern in the line should be the directive
        {
          name: 'keyword.control.directive.mlld',
          match: `\\G/(${this.directives.join('|')})\\b`
        },
        // Then all other mlld patterns
        ...this.generateTextMatePatterns()
      ]
    },
        // Everything else is Markdown
        {
          include: 'text.html.markdown'
        }
      ]
    };
    
    return JSON.stringify(textmate, null, 2);
  }

  generateMarkdownInjection() {
    // This creates an injection grammar that adds Mlld highlighting to Markdown files
    // It activates on both lines starting with Mlld directives AND mlld-run code blocks
    const injection = {
      scopeName: 'markdown.mlld.injection',
      injectionSelector: 'text.html.markdown, text.html.markdown.source',
      patterns: [
        {
          // Match mlld-run code blocks
          begin: '^(```)(mlld-run)\\s*$',
          end: '^(```)\\s*$',
          name: 'meta.embedded.block.mlld-run',
          beginCaptures: {
            1: { name: 'punctuation.definition.markdown.codeFence' },
            2: { name: 'fenced_code.block.language.identifier' }
          },
          endCaptures: {
            1: { name: 'punctuation.definition.markdown.codeFence' }
          },
          contentName: 'source.mlld.embedded',
          patterns: [
            // Apply full mlld syntax within the code block
            {
              begin: `^(${this.patterns.directive})`,
              end: '$',
              name: 'meta.embedded.line.mlld',
              beginCaptures: {
                1: { name: 'keyword.control.directive.mlld' }
              },
              patterns: [
                ...this.generateTextMatePatterns()
              ]
            },
            // Also handle lines that don't start with directives but may contain mlld syntax
            {
              match: '^(?!/).*$',
              name: 'text.plain.mlld'
            }
          ]
        },
        {
          // Match any line starting with a Mlld directive (original behavior)
          begin: `^(${this.patterns.directive})`,
          end: '$',
          name: 'meta.embedded.block.mlld',
          beginCaptures: {
            1: { name: 'keyword.control.directive.mlld' }
          },
          patterns: [
            // Apply all Mlld patterns to the rest of the line
            ...this.generateTextMatePatterns()
          ]
        }
      ]
    };
    
    return JSON.stringify(injection, null, 2);
  }

  generateTextMatePatterns() {
    // Extract just the patterns array for reuse
    // Order matters! More specific patterns should come first
    return [
      {
        name: 'comment.line.double-slash.mlld',
        match: this.patterns.comment
      },
      // Note: We don't include directive pattern here because it's handled
      // separately in the begin pattern of generateTextMate()
      {
        // When keyword (when:) - must come before colon operator
        name: 'keyword.control.when.mlld',
        match: this.patterns.whenKeyword
      },
      {
        // Parallel keyword in /for contexts
        name: 'keyword.control.parallel.mlld',
        match: this.patterns.parallelKeyword
      },
      {
        // with { format: "..." } key
        name: 'keyword.other.with.format.mlld',
        match: this.patterns.withFormatKey
      },
      {
        // Logical operators (high priority)
        name: 'keyword.operator.logical.mlld',
        match: `${this.patterns.logicalAnd}|${this.patterns.logicalOr}|${this.patterns.logicalNot}`
      },
      {
        // Comparison operators
        name: 'keyword.operator.comparison.mlld',
        match: this.patterns.comparisonOps
      },
      {
        // Arrow operator
        name: 'keyword.operator.arrow.mlld',
        match: this.patterns.whenArrow
      },
      {
        // Ternary operators
        name: 'keyword.operator.ternary.mlld',
        match: '[?:]'
      },
      {
        // Reserved variables before regular variables
        name: 'variable.language.reserved.mlld',
        match: this.patterns.reservedVariable
      },
      {
        // Project path shorthand
        name: 'variable.language.reserved.mlld',
        match: this.patterns.projectPathShort
      },
      {
        name: 'keyword.other.language.mlld',
        match: this.patterns.languageKeyword
      },
      {
        // Triple-colon template syntax
        name: 'string.template.triple.mlld',
        begin: ':::',
        end: ':::',
        beginCaptures: {
          0: { name: 'punctuation.definition.template.triple.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.definition.template.triple.end.mlld' }
        },
        patterns: [
          {
            // {{var}} interpolation - ONLY in triple-colon
            name: 'variable.template.mlld',
            begin: '\\{\\{',
            end: '\\}\\}',
            beginCaptures: {
              0: { name: 'punctuation.definition.template.variable.begin.mlld' }
            },
            endCaptures: {
              0: { name: 'punctuation.definition.template.variable.end.mlld' }
            },
            patterns: [
              {
                name: 'variable.other.interpolation.mlld',
                match: '[^}]+'
              }
            ]
          },
          {
            // XML tags in triple-colon templates
            name: 'entity.name.tag.xml.mlld',
            match: '</?[^>]+>'
          }
        ]
      },
      {
        // Double-colon template syntax (now with @var interpolation)
        name: 'string.template.mlld',
        begin: '::',
        end: '::',
        beginCaptures: {
          0: { name: 'punctuation.definition.template.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.definition.template.end.mlld' }
        },
        patterns: [
          {
            name: 'variable.language.reserved.mlld',
            match: this.patterns.reservedVariable
          },
          {
            name: 'variable.other.mlld',
            match: this.patterns.variable
          },
          {
            // Alligator syntax in double-colon templates
            name: 'string.interpolated.alligator.mlld',
            begin: '<',
            end: '>',
            beginCaptures: {
              0: { name: 'punctuation.definition.alligator.begin.mlld' }
            },
            endCaptures: {
              0: { name: 'punctuation.definition.alligator.end.mlld' }
            },
            patterns: [
              {
                name: 'string.path.mlld',
                match: '[^>]+'
              }
            ]
          }
        ]
      },
      {
        name: 'meta.path.mlld',
        begin: '\\[',
        end: '\\]',
        beginCaptures: {
          0: { name: 'punctuation.definition.path.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.definition.path.end.mlld' }
        },
        patterns: [
          {
            name: 'markup.underline.link.mlld',
            match: 'https?://[^\\]]+'
          },
          {
            name: 'variable.language.reserved.mlld',
            match: this.patterns.reservedVariable
          },
          {
            name: 'variable.other.mlld',
            match: this.patterns.variable
          }
        ]
      },
      {
        // Alligator syntax with section marker
        name: 'string.interpolated.alligator.section.mlld',
        match: '<([^>#]+)(\\s*#\\s*)([^>]+)>',
        captures: {
          0: { name: 'punctuation.definition.alligator.mlld' },
          1: { name: 'string.path.mlld' },
          2: { name: 'punctuation.separator.section.mlld' },
          3: { name: 'entity.name.section.mlld' }
        }
      },
      {
        // Regular alligator syntax for file loading
        name: 'string.interpolated.alligator.mlld',
        match: this.patterns.alligatorExpression,
        captures: {
          0: { name: 'meta.alligator.mlld' }
        }
      },
      {
        // Import braces
        name: 'meta.import.mlld',
        begin: '\\{',
        end: '\\}',
        beginCaptures: {
          0: { name: 'punctuation.definition.import.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.definition.import.end.mlld' }
        },
        patterns: [
          {
            name: 'variable.other.import.mlld',
            match: '\\w+'
          },
          {
            name: 'punctuation.separator.comma.mlld',
            match: ','
          },
          {
            name: 'keyword.operator.star.mlld',
            match: '\\*'
          }
        ]
      },
      {
        // Backtick templates
        name: 'string.template.backtick.mlld',
        begin: '`',
        end: '`',
        beginCaptures: {
          0: { name: 'punctuation.definition.template.backtick.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.definition.template.backtick.end.mlld' }
        },
        patterns: [
          {
            name: 'variable.language.reserved.mlld',
            match: this.patterns.reservedVariable
          },
          {
            name: 'variable.other.mlld',
            match: this.patterns.variable
          },
          {
            // Alligator syntax in backticks
            name: 'string.interpolated.alligator.mlld',
            match: this.patterns.alligatorExpression
          }
        ]
      },
      // Language-specific code blocks must come before generic command braces
      {
        // JavaScript/Node code blocks - NO mlld interpolation
        name: 'meta.embedded.block.javascript.mlld',
        begin: '\\b(js|javascript|node)\\s*\\{',
        end: '\\}',
        beginCaptures: {
          1: { name: 'keyword.other.language.mlld' },
          0: { name: 'punctuation.section.embedded.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.section.embedded.end.mlld' }
        },
        contentName: 'source.js.embedded.mlld',
        patterns: [
          { include: 'source.js' }
        ]
      },
      {
        // Python code blocks - NO mlld interpolation
        name: 'meta.embedded.block.python.mlld',
        begin: '\\b(python|py)\\s*\\{',
        end: '\\}',
        beginCaptures: {
          1: { name: 'keyword.other.language.mlld' },
          0: { name: 'punctuation.section.embedded.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.section.embedded.end.mlld' }
        },
        contentName: 'source.python.embedded.mlld',
        patterns: [
          { include: 'source.python' }
        ]
      },
      {
        // Shell/Bash code blocks - NO mlld interpolation
        name: 'meta.embedded.block.shell.mlld',
        begin: '\\b(bash|sh)\\s*\\{',
        end: '\\}',
        beginCaptures: {
          1: { name: 'keyword.other.language.mlld' },
          0: { name: 'punctuation.section.embedded.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.section.embedded.end.mlld' }
        },
        contentName: 'source.shell.embedded.mlld',
        patterns: [
          { include: 'source.shell' }
        ]
      },
      {
        // Generic command braces for /run {command} syntax WITH interpolation
        name: 'meta.command.braces.mlld',
        begin: '(?<!\\b(js|javascript|node|python|py|bash|sh)\\s*)\\{',
        end: '\\}',
        beginCaptures: {
          0: { name: 'punctuation.definition.command.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.definition.command.end.mlld' }
        },
        contentName: 'string.unquoted.command.mlld',
        patterns: [
          {
            name: 'keyword.other.language.mlld',
            match: this.patterns.languageKeyword
          },
          {
            name: 'variable.language.reserved.mlld',
            match: this.patterns.reservedVariable
          },
          {
            name: 'variable.other.mlld',
            match: this.patterns.variable
          },
          {
            // Alligator syntax in commands
            name: 'string.interpolated.alligator.mlld',
            match: this.patterns.alligatorExpression
          }
        ]
      },
      {
        // Double quotes WITH interpolation
        name: 'string.quoted.double.interpolated.mlld',
        begin: '"',
        end: '"',
        beginCaptures: {
          0: { name: 'punctuation.definition.string.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.definition.string.end.mlld' }
        },
        patterns: [
          {
            name: 'variable.language.reserved.mlld',
            match: this.patterns.reservedVariable
          },
          {
            name: 'variable.other.mlld',
            match: this.patterns.variable
          },
          {
            // Alligator syntax in double quotes
            name: 'string.interpolated.alligator.mlld',
            match: this.patterns.alligatorExpression
          }
        ]
      },
      {
        // Single quotes - NO interpolation
        name: 'string.quoted.single.mlld',
        match: this.patterns.singleQuoteString
      },
      {
        // Negation operator
        name: 'keyword.operator.logical.mlld',
        match: this.patterns.negationOperator
      },
      {
        name: 'variable.other.member.mlld',
        match: this.patterns.fieldAccess
      },
      {
        name: 'keyword.operator.mlld',
        match: this.patterns.operators
      },
      {
        // Pipe operator
        name: 'keyword.operator.pipe.mlld',
        match: this.patterns.pipeOperator
      },
      {
        // Assignment operator (higher priority)
        name: 'keyword.operator.assignment.mlld',
        match: this.patterns.assignmentOperator
      },
      {
        name: 'constant.numeric.mlld',
        match: this.patterns.number
      },
      {
        name: 'constant.language.boolean.mlld',
        match: this.patterns.boolean
      },
      {
        name: 'constant.language.null.mlld',
        match: this.patterns.null
      },
      {
        // Variables must come last to avoid matching directives
        name: 'variable.other.mlld',
        match: this.patterns.variable
      }
    ];
  }

  generateVim() {
    const vim = `" Vim syntax file for Mlld
" Language: Mlld
" Maintainer: Auto-generated
" Latest Revision: ${new Date().toISOString()}

if exists("b:current_syntax")
  finish
endif

" Include Markdown syntax as base
runtime! syntax/markdown.vim

" Syntax synchronization
syn sync minlines=10

" Define mlld-specific patterns
" Comments
syn match mlldComment "\\(>>\\|<<\\).*$"

" Directives - must be at start of line
syn match mlldDirective "^/\\(${this.directives.join('\\|')}\\)\\>"

" Operators (high priority)
" Logical operators
syn match mlldLogicalOp "&&\\|||\\|!"
" Comparison operators
syn match mlldComparisonOp "==\\|!=\\|<=\\|>=\\|<\\|>"
" Ternary operators
syn match mlldTernaryOp "[?:]"
" Arrow operator
syn match mlldArrowOp "=>"
" Pipe operator
syn match mlldPipeOp "|"
" Assignment operator
syn match mlldAssignOp "="

" When expressions
syn match mlldWhenKeyword "when\\s*:" contains=mlldWhenColon
syn match mlldWhenColon ":" contained

" Reserved variables
syn match mlldReservedVar "@\\(INPUT\\|TIME\\|PROJECTPATH\\|STDIN\\|input\\|time\\|projectpath\\|stdin\\|now\\|NOW\\|base\\)\\>"
syn match mlldReservedVar "@\\."

" Regular variables (lower priority than directives and reserved)
syn match mlldVariable "@\\w\\+"

" Triple-colon template blocks (with {{var}} interpolation)
syn region mlldTripleTemplate start=":::" end=":::" contains=mlldTemplateVar,mlldXmlTag
syn match mlldTemplateVar "{{[^}]*}}" contained
syn match mlldXmlTag "<[^>]*>" contained

" Template blocks (double-colon syntax with @var interpolation)
syn region mlldTemplate start="::" end="::" contains=mlldVariable,mlldReservedVar,mlldAlligator

" Backtick templates (with @var interpolation)
syn region mlldBacktickTemplate start="\`" end="\`" contains=mlldVariable,mlldReservedVar,mlldAlligator

" Double quotes with interpolation
syn region mlldStringInterpolated start='"' end='"' contains=mlldVariable,mlldReservedVar,mlldAlligator

" Single quotes - no interpolation
syn region mlldStringLiteral start="'" end="'"

" Alligator syntax (file loading) - must contain . / * or @
syn match mlldAlligator "<[^>]*[./*@][^>]*>"
" Alligator with section
syn match mlldAlligatorSection "<\\([^>#]\\+\\)\\(\\s*#\\s*\\)\\([^>]\\+\\)>" contains=mlldSectionMarker
syn match mlldSectionMarker "#" contained

" Language-specific code blocks (NO mlld interpolation)
" JavaScript/Node blocks
syn region mlldJSBlock start="\\<\\(js\\|javascript\\|node\\)\\s*{" matchgroup=mlldCodeDelimiter end="}" contains=@javascript fold keepend
" Python blocks
syn region mlldPythonBlock start="\\<\\(python\\|py\\)\\s*{" matchgroup=mlldCodeDelimiter end="}" contains=@python fold keepend
" Shell/Bash blocks
syn region mlldShellBlock start="\\<\\(bash\\|sh\\)\\s*{" matchgroup=mlldCodeDelimiter end="}" contains=@shell fold keepend

" Generic command blocks (braces) WITH interpolation - must come after language blocks
syn region mlldCommand start="{" end="}" contains=mlldVariable,mlldReservedVar,mlldAlligator,mlldLanguageKeyword

" Language keywords
syn match mlldLanguageKeyword "\\<\\(js\\|javascript\\|node\\|python\\|py\\|bash\\|sh\\)\\>"

" Paths
syn region mlldPath start="\\[" end="\\]" contains=mlldURL,mlldVariable,mlldReservedVar

" URLs
syn match mlldURL "https\\?://[^\\]>]*" contained

" Keywords
syn keyword mlldKeyword from as foreach with to

" Numbers
syn match mlldNumber "\\<\\d\\+\\(\\.\\d\\+\\)\\?\\>"

" Booleans
syn keyword mlldBoolean true false

" Null
syn keyword mlldNull null

" Define highlighting
hi def link mlldComment Comment
hi def link mlldDirective Keyword
hi def link mlldLogicalOp Operator
hi def link mlldComparisonOp Operator
hi def link mlldTernaryOp Operator
hi def link mlldArrowOp Operator
hi def link mlldPipeOp Operator
hi def link mlldAssignOp Operator
hi def link mlldWhenKeyword Keyword
hi def link mlldWhenColon Keyword
hi def link mlldReservedVar Constant
hi def link mlldVariable Identifier
hi def link mlldTripleTemplate String
hi def link mlldTemplate String
hi def link mlldTemplateVar Special
hi def link mlldXmlTag Tag
hi def link mlldBacktickTemplate String
hi def link mlldStringInterpolated String
hi def link mlldStringLiteral String
hi def link mlldAlligator Special
hi def link mlldAlligatorSection Special
hi def link mlldSectionMarker Delimiter
hi def link mlldCommand String
hi def link mlldCodeDelimiter Delimiter
hi def link mlldJSBlock Special
hi def link mlldPythonBlock Special
hi def link mlldShellBlock Special
hi def link mlldLanguageKeyword Type
hi def link mlldPath String
hi def link mlldURL Underlined
hi def link mlldKeyword Operator
hi def link mlldNumber Number
hi def link mlldBoolean Boolean
hi def link mlldNull Constant

let b:current_syntax = "mlld"
`;
    
    return vim;
  }

  generateVimMarkdown() {
    // Vim after/syntax file to override polyglot and ensure mlld highlighting works
    const vimAfter = `" Override polyglot's interference with mlld syntax
" This file loads AFTER other syntax files

" Don't reload if already done
if exists("b:mlld_after_loaded")
  finish
endif
let b:mlld_after_loaded = 1

" Define mlld-run code block region first (highest priority)
syn region mlldRunCodeBlock start="^\\s*\`\`\`mlld-run\\s*$" end="^\\s*\`\`\`\\s*$" contains=mlldRunContent
syn region mlldRunContent start="." end="\\ze^\\s*\`\`\`\\s*$" contained contains=mlldComment,mlldDirective,mlldReserved,mlldVariable,mlldStringInterpolated,mlldStringLiteral,mlldTemplate,mlldTripleTemplate,mlldTemplateVar,mlldCommand,mlldLogicalOp,mlldComparisonOp,mlldTernaryOp,mlldArrowOp,mlldWhenKeyword,mlldAlligator,mlldBacktickTemplate

" Define our syntax patterns directly
syn match mlldComment "\\(>>\\|<<\\).*$"
syn match mlldDirective "^/\\(${this.directives.join('\\|')}\\)\\>"
syn match mlldLogicalOp "&&\\|||\\|!"
syn match mlldComparisonOp "==\\|!=\\|<=\\|>=\\|<\\|>"
syn match mlldTernaryOp "[?:]"
syn match mlldArrowOp "=>"
syn match mlldWhenKeyword "when\\s*:"
syn match mlldReserved "@\\(INPUT\\|TIME\\|PROJECTPATH\\|STDIN\\|input\\|time\\|projectpath\\|stdin\\|now\\|NOW\\|base\\)\\>"
syn match mlldReserved "@\\."
syn match mlldVariable "@\\w\\+"
syn region mlldStringInterpolated start='"' end='"' contains=mlldVariable,mlldReserved,mlldAlligator
syn region mlldStringLiteral start="'" end="'"
syn region mlldTripleTemplate start=":::" end=":::" contains=mlldTemplateVar
syn region mlldTemplate start="::" end="::" contains=mlldVariable,mlldReserved,mlldAlligator
syn match mlldTemplateVar "{{[^}]*}}" contained
syn region mlldBacktickTemplate start="\`" end="\`" contains=mlldVariable,mlldReserved,mlldAlligator
syn match mlldAlligator "<[^>]*[./*@][^>]*>"

" Language-specific blocks
syn region mlldJSBlock start="\\<\\(js\\|javascript\\|node\\)\\s*{" end="}" contains=@javascript fold keepend
syn region mlldPythonBlock start="\\<\\(python\\|py\\)\\s*{" end="}" contains=@python fold keepend
syn region mlldShellBlock start="\\<\\(bash\\|sh\\)\\s*{" end="}" contains=@shell fold keepend

" Syntax synchronization to help reset after language blocks
syn sync minlines=10

" Generic command
syn region mlldCommand start="{" end="}" contains=mlldVariable,mlldReserved,mlldAlligator,mlldLanguageKeyword
syn match mlldLanguageKeyword "\\<\\(js\\|sh\\|node\\|python\\)\\>"

" Force our colors
hi mlldComment ctermfg=242 guifg=#6c6c6c
hi mlldDirective ctermfg=214 cterm=bold guifg=#ffaf00 gui=bold
hi mlldLogicalOp ctermfg=206 guifg=#ff5faf
hi mlldComparisonOp ctermfg=206 guifg=#ff5faf
hi mlldTernaryOp ctermfg=206 guifg=#ff5faf
hi mlldArrowOp ctermfg=214 guifg=#ffaf00
hi mlldWhenKeyword ctermfg=214 cterm=bold guifg=#ffaf00 gui=bold
hi mlldReserved ctermfg=170 guifg=#d75fd7
hi mlldVariable ctermfg=117 guifg=#87d7ff
hi mlldStringInterpolated ctermfg=150 guifg=#afd787
hi mlldStringLiteral ctermfg=150 guifg=#afd787
hi mlldTripleTemplate ctermfg=150 guifg=#afd787
hi mlldTemplate ctermfg=150 guifg=#afd787
hi mlldTemplateVar ctermfg=214 guifg=#ffaf00
hi mlldBacktickTemplate ctermfg=150 guifg=#afd787
hi mlldAlligator ctermfg=229 guifg=#ffffaf
hi mlldCommand ctermfg=150 guifg=#afd787
hi mlldJSBlock ctermfg=214 guifg=#ffaf00
hi mlldPythonBlock ctermfg=214 guifg=#ffaf00
hi mlldShellBlock ctermfg=214 guifg=#ffaf00
hi mlldLanguageKeyword ctermfg=204 guifg=#ff5f87
hi mlldRunCodeBlock ctermfg=242 guifg=#6c6c6c
hi mlldRunContent ctermfg=255 guifg=#ffffff`;
    
    return vimAfter;
  }
  
  generateOriginalVimMarkdown() {
    const vimOrig = `" Vim syntax additions for Mlld in Markdown
syn match markdownMlldDirective "^@\\(${this.directives.join('\\|')}\\)\\>" nextgroup=markdownMlldLine
syn region markdownMlldLine start="." end="$" contained contains=mlldReservedVar,mlldVariable,mlldFieldAccess,mlldTemplate,mlldPath,mlldString,mlldOperator,mlldNumber,mlldBoolean,mlldNull

" Link to Mlld syntax groups
hi def link markdownMlldDirective mlldDirective
`;
    
    return vimAfter;
  }

  generate() {
    const outputDir = path.join(__dirname, '../generated');
    const rootDir = path.join(__dirname, '../..');
    
    // Generate Prism.js
    const prismPath = path.join(outputDir, 'prism-mlld.js');
    fs.writeFileSync(prismPath, this.generatePrism());
    console.log(`Generated: ${prismPath}`);
    
    // Generate TextMate/VSCode
    const textmatePath = path.join(outputDir, 'mlld.tmLanguage.json');
    const textmateContent = this.generateTextMate();
    fs.writeFileSync(textmatePath, textmateContent);
    console.log(`Generated: ${textmatePath}`);
    
    // Generate Vim
    const vimPath = path.join(outputDir, 'mlld.vim');
    const vimContent = this.generateVim();
    fs.writeFileSync(vimPath, vimContent);
    console.log(`Generated: ${vimPath}`);
    
    // Generate Markdown injection grammar for TextMate
    const injectionPath = path.join(outputDir, 'mlld-markdown.injection.json');
    fs.writeFileSync(injectionPath, this.generateMarkdownInjection());
    console.log(`Generated: ${injectionPath}`);
    
    // Generate Vim Markdown support
    const vimMarkdownPath = path.join(outputDir, 'markdown-mlld.vim');
    fs.writeFileSync(vimMarkdownPath, this.generateVimMarkdown());
    console.log(`Generated: ${vimMarkdownPath}`);
    
    // Copy to editor directories
    console.log('\nCopying to editor directories...');
    
    // Copy to VSCode
    const vscodeDir = path.join(rootDir, 'editors/vscode/syntaxes');
    if (fs.existsSync(vscodeDir)) {
      fs.writeFileSync(path.join(vscodeDir, 'mlld.tmLanguage.json'), textmateContent);
      fs.writeFileSync(path.join(vscodeDir, 'mlld-markdown.injection.json'), this.generateMarkdownInjection());
      console.log(`Copied to: ${vscodeDir}/mlld.tmLanguage.json`);
      console.log(`Copied to: ${vscodeDir}/mlld-markdown.injection.json`);
    }
    
    // Copy to Vim
    const vimDir = path.join(rootDir, 'editors/vim/syntax');
    if (fs.existsSync(vimDir)) {
      fs.writeFileSync(path.join(vimDir, 'mlld.vim'), vimContent);
      console.log(`Copied to: ${vimDir}/mlld.vim`);
      
      // Create after/syntax directory for Markdown support
      const vimAfterDir = path.join(rootDir, 'editors/vim/after/syntax');
      if (!fs.existsSync(vimAfterDir)) {
        fs.mkdirSync(vimAfterDir, { recursive: true });
      }
      fs.writeFileSync(path.join(vimAfterDir, 'markdown.vim'), this.generateVimMarkdown());
      console.log(`Copied to: ${vimAfterDir}/markdown.vim`);
    }
    
    // Copy to website
    const websiteDir = path.join(rootDir, 'website/src');
    if (fs.existsSync(websiteDir)) {
      fs.writeFileSync(path.join(websiteDir, 'prism-mlld.js'), this.generatePrism());
      console.log(`Copied to: ${websiteDir}/prism-mlld.js`);
    }
    
    // Create generic TextMate bundle for other editors
    const textmateDir = path.join(rootDir, 'editors/textmate');
    if (!fs.existsSync(textmateDir)) {
      fs.mkdirSync(textmateDir, { recursive: true });
    }
    fs.writeFileSync(path.join(textmateDir, 'mlld.tmLanguage.json'), textmateContent);
    fs.writeFileSync(path.join(textmateDir, 'mlld-markdown.injection.json'), this.generateMarkdownInjection());
    fs.writeFileSync(path.join(textmateDir, 'README.md'), `# Mlld TextMate Grammar

This directory contains TextMate grammar files for Mlld syntax highlighting.

## Files

- \`mlld.tmLanguage.json\` - Main Mlld syntax highlighting for \`.mlld\` and \`.mld\` files
- \`mlld-markdown.injection.json\` - Injection grammar to highlight Mlld directives in Markdown files

## Compatible Editors

These grammar files can be used with:
- Sublime Text
- TextMate
- Nova (with adaptation)
- Any other TextMate-compatible editor

## Installation

Copy these files to your editor's syntax directory. The exact location varies by editor.

### Sublime Text
- macOS: \`~/Library/Application Support/Sublime Text/Packages/Mlld/\`
- Windows: \`%APPDATA%\\Sublime Text\\Packages\\Mlld\\\`
- Linux: \`~/.config/sublime-text/Packages/Mlld/\`

### TextMate
- Create a bundle: \`~/Library/Application Support/TextMate/Bundles/Mlld.tmbundle/Syntaxes/\`
`);
    console.log(`Created TextMate bundle in: ${textmateDir}`);
    
    console.log('\nSyntax highlighting files generated and distributed successfully!');
  }
}

// Run generator
const generator = new MlldSyntaxGenerator();
generator.generate();

export default MlldSyntaxGenerator;
