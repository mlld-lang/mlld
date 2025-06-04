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
      directive: `@(${this.directives.join('|')})\\b`,
      variable: '@\\w+',
      reservedVariable: '@(INPUT|TIME|PROJECTPATH)\\b',
      fieldAccess: '\\.(\\w+|\\d+)',
      templateBlock: '\\[\\[([^\\]\\]]|\\](?!\\]))*\\]\\]',
      templateVar: '\\{\\{[^}]+\\}\\}',
      pathBrackets: '\\[[^\\]]+\\]',
      commandBrackets: '\\[\\(([^\\)]|\\)(?!\\]))*\\)\\]',
      languageKeyword: '\\b(javascript|js|python|py|bash|sh)\\b',
      string: '"[^"]*"',
      comment: '>>.*$',
      operators: '\\b(from|as|foreach|with|to)\\b|=',
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
        const directiveMatches = reservedMatch[1].match(/"@(\w+)"/g);
        if (directiveMatches) {
          // Also check for @output in directives folder
          const directives = directiveMatches.map(d => d.replace(/["@]/g, ''));
          
          // Check if output.peggy exists
          const outputGrammarPath = path.join(__dirname, '../directives/output.peggy');
          if (fs.existsSync(outputGrammarPath)) {
            if (!directives.includes('output')) {
              directives.push('output');
            }
          }
          
          return directives;
        }
      }
    } catch (err) {
      console.warn(`Could not read grammar file: ${err.message}`);
      console.warn('Using hardcoded directive list instead');
    }
    
    // Fallback to known list (only existing directives)
    return ['text', 'data', 'run', 'add', 'path', 'import', 'exec', 'when', 'output'];
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
`;
    
    return prismLang;
  }

  generateTextMate() {
    const textmate = {
      name: 'Mlld',
      scopeName: 'source.mlld',
      fileTypes: ['mlld', 'mld'],
      patterns: [
        {
          name: 'keyword.control.directive.mlld',
          match: this.patterns.directive
        },
        ...this.generateTextMatePatterns()
      ]
    };
    
    return JSON.stringify(textmate, null, 2);
  }

  generateMarkdownInjection() {
    // This creates an injection grammar that adds Mlld highlighting to Markdown files
    // It only activates on lines starting with Mlld directives
    const injection = {
      scopeName: 'markdown.mlld.injection',
      injectionSelector: 'text.html.markdown, text.html.markdown.source',
      patterns: [
        {
          // Match any line starting with a Mlld directive
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
    return [
      {
        name: 'comment.line.double-slash.mlld',
        match: this.patterns.comment
      },
      {
        name: 'keyword.other.language.mlld',
        match: this.patterns.languageKeyword
      },
      {
        name: 'string.template.mlld',
        begin: '\\[\\[',
        end: '\\]\\]',
        patterns: [
          {
            name: 'variable.template.mlld',
            match: this.patterns.templateVar
          }
        ]
      },
      {
        // Command brackets [(...)], should come before path brackets
        name: 'meta.command.mlld',
        begin: '\\[\\(',
        end: '\\)\\]',
        beginCaptures: {
          0: { name: 'punctuation.definition.command.begin.mlld' }
        },
        endCaptures: {
          0: { name: 'punctuation.definition.command.end.mlld' }
        },
        contentName: 'string.unquoted.command.mlld',
        patterns: [
          {
            name: 'variable.other.mlld',
            match: this.patterns.variable
          }
        ]
      },
      {
        name: 'meta.path.mlld',
        begin: '\\[',
        end: '\\]',
        patterns: [
          {
            name: 'markup.underline.link.mlld',
            match: 'https?://[^\\]]+'
          }
        ]
      },
      {
        name: 'string.quoted.double.mlld',
        match: this.patterns.string
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
        name: 'variable.other.member.mlld',
        match: this.patterns.fieldAccess
      },
      {
        name: 'keyword.operator.mlld',
        match: this.patterns.operators
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

" Keywords (directives)
syn keyword mlldDirective ${this.directives.map(d => '@' + d).join(' ')}

" Language keywords
syn keyword mlldLanguage javascript js python py bash sh

" Comments
syn match mlldComment ">>.*$"

" Reserved variables
syn match mlldReservedVar "@\\(INPUT\\|TIME\\|PROJECTPATH\\)\\>"

" Variables
syn match mlldVariable "@\\w\\+"

" Field access
syn match mlldFieldAccess "\\.\\(\\w\\+\\|\\d\\+\\)"

" Template blocks
syn region mlldTemplate start="\\[\\[" end="\\]\\]" contains=mlldTemplateVar
syn match mlldTemplateVar "{{[^}]\\+}}" contained

" Command brackets - must come before path brackets
syn region mlldCommand start="\\[(" end=")\\]" contains=mlldVariable

" Paths/URLs
syn region mlldPath start="\\[" end="\\]" contains=mlldURL
syn match mlldURL "https\\?://[^\\]]*" contained

" Strings
syn region mlldString start='"' end='"'

" Operators
syn match mlldOperator "\\(=\\|from\\|as\\|foreach\\|with\\|to\\)"

" Numbers
syn match mlldNumber "\\<\\d\\+\\(\\.\\d\\+\\)\\?\\>"

" Booleans
syn keyword mlldBoolean true false

" Null
syn keyword mlldNull null

" Define highlighting
hi def link mlldDirective Keyword
hi def link mlldLanguage Type
hi def link mlldComment Comment
hi def link mlldReservedVar Constant
hi def link mlldVariable Identifier
hi def link mlldFieldAccess Special
hi def link mlldTemplate String
hi def link mlldTemplateVar Special
hi def link mlldCommand String
hi def link mlldPath String
hi def link mlldURL Underlined
hi def link mlldString String
hi def link mlldOperator Operator
hi def link mlldNumber Number
hi def link mlldBoolean Boolean
hi def link mlldNull Constant

let b:current_syntax = "mlld"
`;
    
    return vim;
  }

  generateVimMarkdown() {
    // Vim after/syntax file to add Mlld highlighting to Markdown
    const vimAfter = `" Vim syntax additions for Mlld in Markdown
" Place in after/syntax/markdown.vim

" Match Mlld directives at start of line in Markdown
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