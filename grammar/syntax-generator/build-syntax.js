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
      directive: `/(${this.directives.join('|')})\\b`,
      variable: '@\\w+',
      reservedVariable: '@(INPUT|TIME|PROJECTPATH|DEBUG|input|time|projectpath|debug|Input|Time|ProjectPath|Debug|STDIN|stdin|Stdin)\\b',
      projectPathShort: '@\\.',
      negationOperator: '!@',
      fieldAccess: '\\.(\\w+|\\d+)',
      templateBlock: '::[^:]+::',  // New double-colon template syntax
      templateVar: '\\{\\{[^}]+\\}\\}',
      backtickTemplate: '`[^`]*`',
      pathBrackets: '\\[[^\\]]+\\]',
      commandBraces: '\\{[^}]+\\}',  // New command syntax with braces
      languageKeyword: '\\b(javascript|js|node|nodejs|python|py|bash|sh)\\b',
      string: '"[^"]*"',
      singleQuoteString: "'[^']*'",
      comment: '(>>|<<).*$',
      operators: '\\b(from|as|foreach|with|to)\\b',
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
          
          return directives;
        }
      }
    } catch (err) {
      console.warn(`Could not read grammar file: ${err.message}`);
      console.warn('Using hardcoded directive list instead');
    }
    
    // Fallback to known list (v2 directives)
    return ['var', 'show', 'run', 'exe', 'path', 'import', 'when', 'output'];
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
  'template-block': {
    pattern: /${this.patterns.templateBlock}/,
    greedy: true,
    inside: {
      'template-variable': {
        pattern: /${this.patterns.templateVar}/,
        inside: {
          'punctuation': /\\{\\{|\\}\\}/,
          'variable': /[^{}]+/
        }
      },
      'punctuation': /\\[\\[|\\]\\]/
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
  'string': {
    pattern: /${this.patterns.string}/,
    greedy: true
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
        // Double-colon template syntax
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
          }
        ]
      },
      {
        // Command braces for /run {command} syntax
        name: 'meta.command.braces.mlld',
        begin: '\\{',
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
          }
        ]
      },
      {
        name: 'string.quoted.double.mlld',
        match: this.patterns.string
      },
      {
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
        // Assignment operator (higher priority)
        name: 'keyword.operator.assignment.mlld',
        match: '='
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

" Define mlld-specific patterns
" Comments
syn match mlldComment "\\(>>\\|<<\\).*$"

" Directives - must be at start of line
syn match mlldDirective "^/\\(${this.directives.join('\\|')}\\)\\>"

" Reserved variables
syn match mlldReservedVar "@\\(INPUT\\|TIME\\|PROJECTPATH\\|STDIN\\|input\\|time\\|projectpath\\|stdin\\)\\>"
syn match mlldReservedVar "@\\."

" Regular variables (lower priority than directives and reserved)
syn match mlldVariable "@\\w\\+"

" Template blocks (double-colon syntax)
syn region mlldTemplate start="::" end="::" contains=mlldTemplateVar
syn region mlldTemplateVar start="{{" end="}}" contained

" Backtick templates
syn region mlldBacktickTemplate start="\`" end="\`" contains=mlldVariable,mlldReservedVar

" Command blocks (braces)
syn region mlldCommand start="{" end="}" contains=mlldVariable,mlldReservedVar,mlldLanguageKeyword

" Language keywords
syn match mlldLanguageKeyword "\\<\\(js\\|sh\\|node\\|python\\)\\>"

" Paths
syn region mlldPath start="\\[" end="\\]" contains=mlldURL,mlldVariable,mlldReservedVar

" URLs
syn match mlldURL "https\\?://[^\\]]*" contained

" Strings
syn region mlldString start='"' end='"'

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
hi def link mlldReservedVar Constant
hi def link mlldVariable Identifier
hi def link mlldTemplate String
hi def link mlldTemplateVar Special
hi def link mlldBacktickTemplate String
hi def link mlldCommand String
hi def link mlldLanguageKeyword Type
hi def link mlldPath String
hi def link mlldURL Underlined
hi def link mlldString String
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
syn region mlldRunContent start="." end="\\ze^\\s*\`\`\`\\s*$" contained contains=mlldComment,mlldDirective,mlldReserved,mlldVariable,mlldString,mlldTemplate,mlldTemplateVar,mlldCommand

" Define our syntax patterns directly
syn match mlldComment "\\(>>\\|<<\\).*$"
syn match mlldDirective "^/\\(${this.directives.join('\\|')}\\)\\>"
syn match mlldReserved "@\\(INPUT\\|TIME\\|PROJECTPATH\\|STDIN\\|input\\|time\\|projectpath\\|stdin\\)\\>"
syn match mlldReserved "@\\."
syn match mlldVariable "@\\w\\+"
syn region mlldString start='"' end='"'
syn region mlldTemplate start="::" end="::" contains=mlldTemplateVar
syn match mlldTemplateVar "{{[^}]*}}" contained
syn region mlldBacktickTemplate start="\`" end="\`" contains=mlldVariable,mlldReserved
syn region mlldCommand start="{" end="}" contains=mlldVariable,mlldReserved,mlldLanguageKeyword
syn match mlldLanguageKeyword "\\<\\(js\\|sh\\|node\\|python\\)\\>"

" Force our colors
hi mlldComment ctermfg=242 guifg=#6c6c6c
hi mlldDirective ctermfg=214 cterm=bold guifg=#ffaf00 gui=bold
hi mlldReserved ctermfg=170 guifg=#d75fd7
hi mlldVariable ctermfg=117 guifg=#87d7ff
hi mlldString ctermfg=150 guifg=#afd787
hi mlldTemplate ctermfg=150 guifg=#afd787
hi mlldTemplateVar ctermfg=214 guifg=#ffaf00
hi mlldBacktickTemplate ctermfg=150 guifg=#afd787
hi mlldCommand ctermfg=150 guifg=#afd787
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