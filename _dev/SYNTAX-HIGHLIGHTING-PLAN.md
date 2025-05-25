# Meld Syntax Highlighting Strategic Plan

## Overview
This document outlines a comprehensive strategy for implementing and maintaining syntax highlighting across the Meld project by leveraging our existing Peggy grammar as the single source of truth.

## Current State Analysis

### Issues Identified
1. **Manual HTML Markup**: Website examples use hardcoded `<span class="token keyword">` tags
2. **Outdated Syntax**: Missing `@url` directive, still using `.mlld` extension in some places
3. **No Dynamic Highlighting**: Website lacks client-side or build-time syntax highlighting
4. **Disconnected Examples**: Test examples in `tests/cases/` aren't used for website documentation
5. **Separate Grammar Definitions**: Each editor maintains its own syntax patterns instead of using the authoritative Peggy grammar

### Existing Assets
- **Authoritative Peggy Grammar**: Complete language definition in `grammar/` directory
- **Current Editor Support**: VSCode (`editors/vscode/`) and Vim (`editors/vim/`)
- **Well-defined token CSS classes**: Website already has styling for syntax tokens
- **Rich test examples**: Auto-generated `tests/cases/EXAMPLES.md`
- **Eleventy-based static site**: Ready for enhancement

## Strategic Plan: Grammar-Based Syntax Highlighting

### Core Concept
Use the existing Peggy grammar (`grammar/meld.peggy` and related files) as the single source of truth to generate syntax highlighting for all targets.

### Phase 1: Grammar Analysis & Token Extraction

#### 1.1 Create Grammar Parser/Analyzer
- **Goal**: Extract token patterns from Peggy grammar files
- **Implementation**:
  ```
  grammar/
    meld.peggy              # Existing grammar (source of truth)
    directives/*.peggy      # Existing directive definitions
    
    syntax-generator/
      extract-tokens.js     # Parse Peggy files and extract patterns
      build-syntax.js       # Generate target-specific syntax files
      token-map.json        # Mapping of grammar rules to token types
      
    generated/
      textmate.json         # For VSCode
      prism-meld.js         # For website
      vim-meld.vim          # For Vim
  ```

#### 1.2 Token Extraction Strategy
Extract from Peggy grammar:
- **Directives**: `@text`, `@data`, `@run`, `@add`, `@path`, `@import`, `@exec`, `@define`, `@embed`, `@url`
- **Variables**: `@identifier` patterns
- **Operators**: `=`, `from`, `as`, etc.
- **Delimiters**: `[[...]]`, `[...]`, `{{...}}`, etc.
- **Literals**: Strings, numbers, booleans, null
- **Comments**: `>>` patterns

### Phase 2: Simplified Syntax Generator

#### 2.1 Simplified Token Rules
Based on Meld's clean syntax design:
- **Directives**: Fixed set - `@text`, `@data`, `@run`, `@add`, `@path`, `@import`, `@exec`, `@define`, `@embed`, `@url`
- **Variables**: Any `@identifier` that's not a directive
- **Templates**: `[[...]]` with `{{variable}}` interpolation
- **Strings**: `"..."` are always literal (no interpolation)
- **Paths**: `[...]` for file paths and URLs
- **Comments**: `>>` line comments

#### 2.2 Simplified Generator Implementation
```javascript
// grammar/syntax-generator/build-syntax.js
const fs = require('fs');

class MeldSyntaxGenerator {
  constructor() {
    // Extract directives from grammar/base/tokens.peggy
    this.directives = this.extractDirectivesFromGrammar();
    
    // Simple, clear token patterns
    this.patterns = {
      directive: `@(${this.directives.join('|')})\\b`,
      variable: '@\\w+',  // Any @word that's not a directive
      templateBlock: '\\[\\[([^\\]\\]]|\\](?!\\]))*\\]\\]',
      templateVar: '\\{\\{[^}]+\\}\\}',
      pathBrackets: '\\[[^\\]]+\\]',
      string: '"[^"]*"',
      comment: '>>.*$',
      operators: '=|from|as',
      number: '\\b\\d+(\\.\\d+)?\\b',
      boolean: '\\b(true|false)\\b',
      null: '\\bnull\\b'
    };
  }
  
  extractDirectivesFromGrammar() {
    // Read grammar file and extract directive list
    const grammar = fs.readFileSync('grammar/base/tokens.peggy', 'utf8');
    const match = grammar.match(/ReservedDirective[^=]*=\s*([\s\S]*?)(?=\n\w)/);
    if (match) {
      return match[1].match(/@(\w+)/g).map(d => d.substring(1));
    }
    // Fallback to known list
    return ['text', 'data', 'run', 'add', 'path', 'import', 'exec', 'define', 'embed', 'url'];
  }
  
  generatePrism() {
    return `Prism.languages.meld = {
  'directive': {
    pattern: /${this.patterns.directive}/,
    alias: 'keyword'
  },
  'template-block': {
    pattern: /${this.patterns.templateBlock}/,
    inside: {
      'template-var': /${this.patterns.templateVar}/,
      'punctuation': /\\[\\[|\\]\\]/
    }
  },
  'variable': /${this.patterns.variable}/,
  'path': /${this.patterns.pathBrackets}/,
  'string': /${this.patterns.string}/,
  'comment': /${this.patterns.comment}/,
  'operator': /${this.patterns.operators}/,
  'number': /${this.patterns.number}/,
  'boolean': /${this.patterns.boolean}/,
  'null': /${this.patterns.null}/,
  'punctuation': /[{}(),]/
};`;
  }
}
```

#### 2.2 Implement Prism.js for Website
- **Goal**: Dynamic, maintainable syntax highlighting
- **Benefits**:
  - No manual HTML markup needed
  - Generated from same source as editors
  - Build-time highlighting via markdown-it plugin
- **Implementation**:
  - Add Prism.js as dependency
  - Use generated `prism-meld.js`
  - Integrate with Eleventy build

### Phase 3: Example Management System

#### 3.1 Example File Structure
```
examples/
  syntax/
    directives/
      text-basic.mld
      text-basic.meta.yaml    # Frontmatter for website
      data-complex.mld
      data-complex.meta.yaml
    templates/
      variable-interpolation.mld
      variable-interpolation.meta.yaml
```

#### 3.2 Example Metadata Format
```yaml
# text-basic.meta.yaml
title: "Basic Text Assignment"
description: "Shows how to assign string values to variables"
category: "directives"
tags: ["text", "variables", "basics"]
order: 1
sidebar_note: "Text variables are the foundation of Meld scripting"
```

#### 3.3 Build Process Integration
- Extract examples during build
- Apply syntax highlighting automatically
- Generate both:
  - Website documentation pages
  - Test fixtures for grammar validation

### Phase 4: Implementation Details

#### 4.1 Eleventy Plugin for Examples
```javascript
// eleventy-meld-examples.js
module.exports = function(eleventyConfig) {
  // Register shortcode for embedding examples
  eleventyConfig.addShortcode("meldExample", async function(examplePath) {
    const content = await fs.readFile(examplePath, 'utf8');
    const meta = await loadMetadata(examplePath);
    const highlighted = await highlightMeld(content);
    
    return `
      <div class="example-container">
        <h4>${meta.title}</h4>
        <p>${meta.description}</p>
        <pre><code class="language-meld">${highlighted}</code></pre>
        ${meta.sidebar_note ? `<aside>${meta.sidebar_note}</aside>` : ''}
      </div>
    `;
  });
};
```

#### 4.2 Generated Prism.js Integration
The Prism language definition will be automatically generated from the grammar:

```javascript
// generated/prism-meld.js (auto-generated)
Prism.languages.meld = {
  // Generated from grammar/directives/*.peggy
  'directive': {
    pattern: /@(text|data|path|run|exec|import|add|embed|define|url)\b/,
    alias: 'keyword'
  },
  // Generated from Variable patterns
  'variable': {
    pattern: /@\w+/,
    alias: 'variable'
  },
  // ... rest generated from grammar patterns
};
```

This ensures the website highlighting always matches the actual parser.

### Phase 5: Migration Path

#### 5.1 Website Migration
1. **Install Dependencies**:
   ```bash
   npm install --save prismjs prism-themes markdown-it-prism
   ```

2. **Update Eleventy Config**:
   ```javascript
   // .eleventy.js
   const markdownItPrism = require('markdown-it-prism');
   require('./src/prism-meld'); // Custom language
   
   const markdownLib = markdownIt({
     html: true,
     breaks: true,
     linkify: true
   })
   .use(markdownItAnchor)
   .use(markdownItPrism);
   ```

3. **Convert Existing Examples**:
   - Create migration script to extract hardcoded examples
   - Convert to markdown code blocks with `meld` language
   - Preserve any sidebar notes or descriptions

#### 5.2 Editor Updates
1. **Update VSCode Extension**:
   - Replace manual patterns with generated `textmate.json`
   - Add `@url` directive support (via generation)
   - Update all `.mlld` references to `.mld`
   - Test with example files

2. **Update Vim Syntax**:
   - Replace manual patterns with generated `vim-meld.vim`
   - Update file extension references
   - Test with example files

### Phase 6: Automation & Testing

#### 6.1 Grammar Validation Tests
```javascript
// test/syntax-highlighting.test.js
describe('Syntax Highlighting', () => {
  const examples = loadExamples('examples/syntax/**/*.mld');
  
  examples.forEach(example => {
    it(`should correctly highlight ${example.name}`, () => {
      const tokens = tokenize(example.content);
      expect(tokens).toMatchSnapshot();
    });
  });
});
```

#### 6.2 Visual Regression Tests
- Capture screenshots of highlighted examples
- Compare against baseline images
- Alert on visual differences

### Phase 7: Documentation

#### 7.1 Contributing Guide
Create `SYNTAX-HIGHLIGHTING.md` with:
- How to add new syntax patterns
- How to test highlighting changes
- How to add new examples
- Example metadata format

#### 7.2 Website Build Docs
Update build documentation with:
- How syntax highlighting works
- How to add new examples
- How to customize highlighting themes

## Implementation Timeline

### Day 1: Build Generator (~4 hours)
- [ ] Create simple `build-syntax.js` script
- [ ] Extract directive list from grammar
- [ ] Generate all three syntax formats
- [ ] Add `npm run build:syntax` command

### Day 2: Website Integration (~4 hours)
- [ ] Set up Prism.js in website
- [ ] Use generated `prism-meld.js`
- [ ] Update Eleventy configuration
- [ ] Convert hardcoded examples

### Day 3: Update Editors (~2 hours)
- [ ] Replace VSCode syntax with generated version
- [ ] Replace Vim syntax with generated version
- [ ] Test all directives including `@url`
- [ ] Fix `.mlld` → `.mld` references

### Day 4: Polish & Documentation (~2 hours)
- [ ] Create example management system
- [ ] Add basic tests
- [ ] Document the process
- [ ] Submit PR

**Total: ~12 hours of work**

## Benefits

1. **Single Source of Truth**: Grammar defines both parsing AND highlighting
2. **Automatic Updates**: Adding a directive to grammar automatically updates all syntax highlighters
3. **Consistency**: Guaranteed matching between parser and highlighters
4. **No Manual Maintenance**: Generated files mean no manual pattern updates
5. **Testability**: Can validate highlighting against actual parser
6. **Reduced Errors**: No chance of highlighting rules diverging from grammar
7. **Professional**: Industry-standard tooling (Prism.js) with custom generation

## Success Criteria

- [ ] All syntax files generated from Peggy grammar
- [ ] Zero manual HTML syntax markup required
- [ ] Highlighting always matches parser behavior
- [ ] All directives (including `@url`) properly highlighted
- [ ] Single `npm run build:syntax` command updates all targets
- [ ] Examples automatically highlighted on website
- [ ] Editors use generated syntax files
- [ ] Adding new grammar rules auto-updates highlighting

## Future Enhancements

1. **AST-based Highlighting**: Use actual Meld parser for semantic highlighting
2. **Language Server Protocol**: Full IDE support with semantic tokens
3. **Interactive Playground**: Live Meld editor with real-time highlighting
4. **Theme Generator**: Create color schemes that work across all targets
5. **Incremental Updates**: Watch grammar files and auto-regenerate

## Key Implementation Notes

### Implementation Simplifications

With Meld's clean syntax design, we can simplify significantly:

1. **No Complex Parsing Needed**: Just extract the directive list from `ReservedDirective` rule
2. **Clear Token Boundaries**: `@` prefix and `[[...]]`/`[...]` brackets make tokenization trivial
3. **No Context Tracking**: Strings are always literal, templates are always `[[...]]`
4. **Single Variable Format**: Only `{{var}}` in templates, only `@var` elsewhere

### Simplified Architecture
```
grammar/
  syntax-generator/
    build-syntax.js       # Simple 200-line script
    package.json          # Just needs 'fs' and 'path'
  
  generated/              # Output directory
    prism-meld.js         # For website
    meld.tmLanguage.json  # For VSCode
    meld.vim              # For Vim
    
package.json scripts:
  "build:syntax": "node grammar/syntax-generator/build-syntax.js"
```

This is now simple enough to implement in a single afternoon!