#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MeldSyntaxGenerator {
  constructor() {
    // Extract directives from grammar
    this.directives = this.extractDirectivesFromGrammar();
    console.log('Found directives:', this.directives);
    
    // Define token patterns
    this.patterns = {
      directive: `@(${this.directives.join('|')})\\b`,
      variable: '@\\w+',
      templateBlock: '\\[\\[([^\\]\\]]|\\](?!\\]))*\\]\\]',
      templateVar: '\\{\\{[^}]+\\}\\}',
      pathBrackets: '\\[[^\\]]+\\]',
      string: '"[^"]*"',
      comment: '>>.*$',
      operators: '\\b(from|as)\\b|=',
      number: '\\b\\d+(\\.\\d+)?\\b',
      boolean: '\\b(true|false)\\b',
      null: '\\bnull\\b'
    };
  }

  extractDirectivesFromGrammar() {
    try {
      const grammarPath = path.join(__dirname, '../../base/tokens.peggy');
      const grammar = fs.readFileSync(grammarPath, 'utf8');
      
      // Look for ReservedDirective rule
      const reservedMatch = grammar.match(/ReservedDirective[^=]*=([^;]+)/s);
      if (reservedMatch) {
        const directiveMatches = reservedMatch[1].match(/"@(\w+)"/g);
        if (directiveMatches) {
          return directiveMatches.map(d => d.replace(/"@(\w+)"/, '$1'));
        }
      }
    } catch (err) {
      console.warn('Could not extract directives from grammar, using fallback list');
    }
    
    // Fallback to known list
    return ['text', 'data', 'run', 'add', 'path', 'import', 'exec', 'define', 'embed', 'url'];
  }

  generatePrism() {
    const prismLang = `// Auto-generated Prism.js language definition for Meld
// Generated from grammar at ${new Date().toISOString()}

Prism.languages.meld = {
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
  'variable': {
    pattern: /${this.patterns.variable}/,
    alias: 'variable'
  },
  'operator': /${this.patterns.operators}/,
  'number': /${this.patterns.number}/,
  'boolean': /${this.patterns.boolean}/,
  'null': /${this.patterns.null}/,
  'punctuation': /[{}(),]/
};

// Also highlight .meld and .mld files
Prism.languages.mld = Prism.languages.meld;
`;
    
    return prismLang;
  }

  generateTextMate() {
    const textmate = {
      name: 'Meld',
      scopeName: 'source.meld',
      fileTypes: ['meld', 'mld'],
      patterns: [
        {
          name: 'keyword.control.directive.meld',
          match: this.patterns.directive
        },
        ...this.generateTextMatePatterns()
      ]
    };
    
    return JSON.stringify(textmate, null, 2);
  }

  generateMarkdownInjection() {
    // This creates an injection grammar that adds Meld highlighting to Markdown files
    // It only activates on lines starting with Meld directives
    const injection = {
      scopeName: 'markdown.meld.injection',
      injectionSelector: 'text.html.markdown, text.html.markdown.source',
      patterns: [
        {
          // Match any line starting with a Meld directive
          begin: `^(${this.patterns.directive})`,
          end: '$',
          name: 'meta.embedded.block.meld',
          beginCaptures: {
            1: { name: 'keyword.control.directive.meld' }
          },
          patterns: [
            // Apply all Meld patterns to the rest of the line
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
        name: 'comment.line.double-slash.meld',
        match: this.patterns.comment
      },
      {
        name: 'string.template.meld',
        begin: '\\[\\[',
        end: '\\]\\]',
        patterns: [
          {
            name: 'variable.template.meld',
            match: this.patterns.templateVar
          }
        ]
      },
      {
        name: 'meta.path.meld',
        begin: '\\[',
        end: '\\]',
        patterns: [
          {
            name: 'markup.underline.link.meld',
            match: 'https?://[^\\]]+'
          }
        ]
      },
      {
        name: 'string.quoted.double.meld',
        match: this.patterns.string
      },
      {
        name: 'variable.other.meld',
        match: this.patterns.variable
      },
      {
        name: 'keyword.operator.meld',
        match: this.patterns.operators
      },
      {
        name: 'constant.numeric.meld',
        match: this.patterns.number
      },
      {
        name: 'constant.language.boolean.meld',
        match: this.patterns.boolean
      },
      {
        name: 'constant.language.null.meld',
        match: this.patterns.null
      }
    ];
  }

  generateVim() {
    const vim = `" Vim syntax file for Meld
" Language: Meld
" Maintainer: Auto-generated
" Latest Revision: ${new Date().toISOString()}

if exists("b:current_syntax")
  finish
endif

" Keywords (directives)
syn keyword meldDirective ${this.directives.map(d => '@' + d).join(' ')}

" Comments
syn match meldComment ">>.*$"

" Variables
syn match meldVariable "@\\w\\+"

" Template blocks
syn region meldTemplate start="\\[\\[" end="\\]\\]" contains=meldTemplateVar
syn match meldTemplateVar "{{[^}]\\+}}" contained

" Paths/URLs
syn region meldPath start="\\[" end="\\]" contains=meldURL
syn match meldURL "https\\?://[^\\]]*" contained

" Strings
syn region meldString start='"' end='"'

" Operators
syn match meldOperator "\\(=\\|from\\|as\\)"

" Numbers
syn match meldNumber "\\<\\d\\+\\(\\.\\d\\+\\)\\?\\>"

" Booleans
syn keyword meldBoolean true false

" Null
syn keyword meldNull null

" Define highlighting
hi def link meldDirective Keyword
hi def link meldComment Comment
hi def link meldVariable Identifier
hi def link meldTemplate String
hi def link meldTemplateVar Special
hi def link meldPath String
hi def link meldURL Underlined
hi def link meldString String
hi def link meldOperator Operator
hi def link meldNumber Number
hi def link meldBoolean Boolean
hi def link meldNull Constant

let b:current_syntax = "meld"
`;
    
    return vim;
  }

  generateVimMarkdown() {
    // Vim after/syntax file to add Meld highlighting to Markdown
    const vimAfter = `" Vim syntax additions for Meld in Markdown
" Place in after/syntax/markdown.vim

" Match Meld directives at start of line in Markdown
syn match markdownMeldDirective "^@\\(${this.directives.join('\\|')}\\)\\>" nextgroup=markdownMeldLine
syn region markdownMeldLine start="." end="$" contained contains=meldVariable,meldTemplate,meldPath,meldString,meldOperator,meldNumber,meldBoolean,meldNull

" Link to Meld syntax groups
hi def link markdownMeldDirective meldDirective
`;
    
    return vimAfter;
  }

  generate() {
    const outputDir = path.join(__dirname, '../generated');
    const rootDir = path.join(__dirname, '../../..');
    
    // Generate Prism.js
    const prismPath = path.join(outputDir, 'prism-meld.js');
    fs.writeFileSync(prismPath, this.generatePrism());
    console.log(`Generated: ${prismPath}`);
    
    // Generate TextMate/VSCode
    const textmatePath = path.join(outputDir, 'meld.tmLanguage.json');
    const textmateContent = this.generateTextMate();
    fs.writeFileSync(textmatePath, textmateContent);
    console.log(`Generated: ${textmatePath}`);
    
    // Generate Vim
    const vimPath = path.join(outputDir, 'meld.vim');
    const vimContent = this.generateVim();
    fs.writeFileSync(vimPath, vimContent);
    console.log(`Generated: ${vimPath}`);
    
    // Generate Markdown injection grammar for TextMate
    const injectionPath = path.join(outputDir, 'meld-markdown.injection.json');
    fs.writeFileSync(injectionPath, this.generateMarkdownInjection());
    console.log(`Generated: ${injectionPath}`);
    
    // Generate Vim Markdown support
    const vimMarkdownPath = path.join(outputDir, 'markdown-meld.vim');
    fs.writeFileSync(vimMarkdownPath, this.generateVimMarkdown());
    console.log(`Generated: ${vimMarkdownPath}`);
    
    // Copy to editor directories
    console.log('\nCopying to editor directories...');
    
    // Copy to VSCode
    const vscodeDir = path.join(rootDir, 'editors/vscode/syntaxes');
    if (fs.existsSync(vscodeDir)) {
      fs.writeFileSync(path.join(vscodeDir, 'meld.tmLanguage.json'), textmateContent);
      fs.writeFileSync(path.join(vscodeDir, 'meld-markdown.injection.json'), this.generateMarkdownInjection());
      console.log(`Copied to: ${vscodeDir}/meld.tmLanguage.json`);
      console.log(`Copied to: ${vscodeDir}/meld-markdown.injection.json`);
    }
    
    // Copy to Vim
    const vimDir = path.join(rootDir, 'editors/vim/syntax');
    if (fs.existsSync(vimDir)) {
      fs.writeFileSync(path.join(vimDir, 'meld.vim'), vimContent);
      console.log(`Copied to: ${vimDir}/meld.vim`);
      
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
      fs.writeFileSync(path.join(websiteDir, 'prism-meld.js'), this.generatePrism());
      console.log(`Copied to: ${websiteDir}/prism-meld.js`);
    }
    
    // Create generic TextMate bundle for other editors
    const textmateDir = path.join(rootDir, 'editors/textmate');
    if (!fs.existsSync(textmateDir)) {
      fs.mkdirSync(textmateDir, { recursive: true });
    }
    fs.writeFileSync(path.join(textmateDir, 'meld.tmLanguage.json'), textmateContent);
    fs.writeFileSync(path.join(textmateDir, 'meld-markdown.injection.json'), this.generateMarkdownInjection());
    fs.writeFileSync(path.join(textmateDir, 'README.md'), `# Meld TextMate Grammar

This directory contains TextMate grammar files for Meld syntax highlighting.

## Files

- \`meld.tmLanguage.json\` - Main Meld syntax highlighting for \`.meld\` and \`.mld\` files
- \`meld-markdown.injection.json\` - Injection grammar to highlight Meld directives in Markdown files

## Compatible Editors

These grammar files can be used with:
- Sublime Text
- TextMate
- Nova (with adaptation)
- Any other TextMate-compatible editor

## Installation

Copy these files to your editor's syntax directory. The exact location varies by editor.

### Sublime Text
- macOS: \`~/Library/Application Support/Sublime Text/Packages/Meld/\`
- Windows: \`%APPDATA%\\Sublime Text\\Packages\\Meld\\\`
- Linux: \`~/.config/sublime-text/Packages/Meld/\`

### TextMate
- Create a bundle: \`~/Library/Application Support/TextMate/Bundles/Meld.tmbundle/Syntaxes/\`
`);
    console.log(`Created TextMate bundle in: ${textmateDir}`);
    
    console.log('\nSyntax highlighting files generated and distributed successfully!');
  }
}

// Run generator
const generator = new MeldSyntaxGenerator();
generator.generate();

export default MeldSyntaxGenerator;