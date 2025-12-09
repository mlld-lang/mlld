---
updated: 2025-01-07
tags: #grammar, #parser, #peggy
related-docs: docs/dev/AST.md, grammar/docs/DEBUG.md
related-code: grammar/*.peggy, grammar/deps/grammar-core.ts, grammar/build-grammar.mjs
related-types: core/types { DirectiveNode, NodeType, DirectiveKind }
---

# GRAMMAR

## tldr

mlld's Peggy.js grammar uses abstraction-first design with hierarchical patterns. Source files in `grammar/*.peggy` concatenate during build. Helpers live in `grammar/deps/grammar-core.ts`. Grammar and TypeScript types must stay 100% synchronized. When changing grammar, fix abstractions not symptoms.

Recent additions:
- `||` marks parallel pipeline stages
- `/append` directive and `append` pipeline builtin enable incremental file writes

## Principles

- **First match wins**: PEG.js has no concept of specificity and never backtracks after matching, so **rule order matters** -- more specific rules go first
- **Abstraction-first**: Reuse patterns at appropriate levels, never duplicate parsing logic
- **Semantic forks**: Directives determine their content parsing rules, not delimiters. Same syntax can have different semantics based on context (e.g., `/run` with language → code semantics, without → command semantics)
- **Type synchronization**: Grammar output must match TypeScript interfaces exactly
- **Error commitment**: Once directive identified, stay in that error recovery branch
- **Values are node arrays**: All directive values contain arrays of nodes (except data literals)

## Details

### Structure

```
grammar/
├── mlld.peggy           # Root file with initialization block
├── base/                # Core primitives (tokens, whitespace, context)
├── patterns/            # Reusable patterns (variables, content, lists)
├── core/                # Directive cores (shared directive logic)
├── directives/          # Directive implementations
├── deps/                # Source helper files (edit these)
│   └── grammar-core.ts  # Helper functions and type exports
├── parser/              # Parser interface only
│   └── index.ts         # Wrapper importing from generated/
├── generated/           # Generated files (gitignored, never edit)
│   └── parser/
│       ├── parser.js/ts/cjs
│       └── deps/        # Generated helper versions
├── docs/                # Grammar documentation
├── syntax-generator/    # VSCode/TextMate syntax generation
└── tests/               # Grammar tests
```


### Build Process

1. `npm run build:grammar` concatenates `.peggy` files in order:
   - `mlld.peggy` (initialization block)
   - `base/*.peggy` (primitives)
   - `patterns/*.peggy` (reusables)
   - `core/*.peggy` (directive cores)
   - `directives/*.peggy` (implementations)

2. Generates to `grammar/generated/parser/` (gitignored):
   - `parser.js/ts/cjs` - Parser versions
   - `deps/` - Helper dependencies

3. Source helpers: Edit `grammar/deps/grammar-core.ts` only

### Abstraction Hierarchy

```
Level 1: base/           → Core primitives (BaseIdentifier, BaseToken)
Level 2-5: patterns/     → Reusable patterns (variables, content, lists)
Level 6: core/          → Directive cores (shared logic)
Level 7: directives/    → Directive implementations
```

### Delimiter Consistency

- `<...>` - Load/dereference content
- `[...]` - Array literal
- `"..."` - String with @var interpolation
- `'...'` - Literal string (no interpolation)
- `` `...` `` - Template with @var interpolation
- `::...::` - Template with @var (escape backticks)
- `:::...:::` - Template with {{var}} (escape @)

### Critical Patterns

Before creating patterns, check `patterns/` for existing abstractions:
- `AtVar` - Variable references
- `WrappedPathContent` - Path handling
- `TemplateCore` - Template parsing
- `GenericList` - Comma-separated lists

## Gotchas

- NEVER edit files in `grammar/generated/` - regenerated on build
- NEVER use `peg$imports` - helpers available globally
- ALWAYS check types in `core/types/` before grammar changes
- ONLY `mlld.peggy` can have initialization block
- VALUES must be node arrays for interpolation support
- JavaScript in `{...}` blocks has undocumented PEG.js limitations
- NAMING: Use PascalCase, follow prefixes (Base*, At*, Wrapped*) and suffixes (*Identifier, *Pattern, *Content, *Core, *Token, *List not *sList)
- ANTI-PATTERNS: Don't duplicate list logic (use GenericList), don't redefine variable patterns (use AtVar), don't ignore core abstractions (use TemplateCore), don't create local versions of existing patterns
- ALWAYS make sure you build before doing any testing! `npm run build` to get both grammar and test fixtures. 
- ALWAYS make sure you're using a local build -- `./dist/cli.cjs` or `npm run reinstall` to get a globally runnable symlink with `mlld-<branch>`

## Enhancements

### Adding a New Directive
1. Check if similar directives exist in `directives/`
2. Identify required patterns (check `patterns/` for variables, content, lists)
3. Use existing cores from `core/` for shared logic
4. Add to `directives/` with proper naming
5. Update `mlld.peggy` to include it

### Creating a Shared Pattern
1. Identify duplication across files
2. Abstract to appropriate level (base/ → patterns/ → core/)
3. Place in correct directory
4. Update all usages to import
5. Document with comment: `// PATTERN NAME - Description`

### Review Checklist
Before committing grammar changes:
- [ ] No duplicate patterns introduced
- [ ] Used existing abstractions where available
- [ ] Followed naming conventions
- [ ] All tests pass (`npm test grammar/`)
- [ ] Verified AST output (`npm run ast -- '<syntax>'`)
- [ ] Types in `core/types/` still aligned

## Debugging

### Debug Grammar Parsing
```bash
DEBUG_MLLD_GRAMMAR=1 npm run ast -- '/var @test = "value"'
```
You can use heredoc or pipe files to `npm run ast` if it fails due to shell escaping (which happens). 

### Safe Debug Placement
- **Safe**: Inside existing action blocks `{ helpers.debug('Rule', data); return result; }`
- **Safe**: Rule entry with predicate `&{ helpers.debug('Trying...'); return true; }`
- **Unsafe**: Before alternatives (`/`), in fundamental rules, or modifying predicates

### Helper Functions
Add to `grammar/deps/grammar-core.ts`:
```typescript
helpers.debug('RuleName matched', { data });

// Error detection helpers
helpers.isUnclosedArray = function(input, pos) {
  let depth = 1, i = pos;
  while (i < input.length && depth > 0) {
    if (input[i] === '[') depth++;
    else if (input[i] === ']') depth--;
    else if (input[i] === '\n' && depth > 0) return true;
    i++;
  }
  return depth > 0;
};

helpers.isUnclosedObject = function(input, pos) {
  let depth = 1, i = pos;
  while (i < input.length && depth > 0) {
    if (input[i] === '{') depth++;
    else if (input[i] === '}') depth--;
    else if (input[i] === '\n' && depth > 0) return true;
    i++;
  }
  return depth > 0;
};
```

### Error Recovery Pattern
```peggy
DirectiveName "description"
  = DirectiveContext "/directive" /* success */ { return ast; }
  / DirectiveContext "/directive" /* partial */ &{ helpers.detectError() } { 
      error(`Specific helpful error`); 
    }
  / DirectiveContext "/directive" { error(`Generic directive error`); }
```

### Common Issues

**JavaScript build failures**: Cryptic errors like "Expected token but '{' found" indicate JavaScript issues in action blocks. Problematic: `.includes()`, object spread `...`, complex transformations. Solution: simplify incrementally, hardcode values, prefer pre-calculated metadata
**Backtracking errors**: Implement committed error recovery
**Type mismatches**: Check `core/types/` alignment
**Duplicate patterns**: Use existing abstractions from `patterns/`
**Context detection**: Use helpers in `base/context.peggy`

### Testing Changes
```bash
npm run build:grammar
npm test grammar/
npm run ast -- '<your syntax>'
```

### Key Algorithms

**Context Detection**: `helpers.isDirectiveContext()` determines directive vs content (slash optional; strict mode gates bare directives)
**Semantic Commitment**: Once directive identified, parser commits to that branch
**Location Tracking**: Peggy's `location()` includes lookahead (see issue #340)

### Architectural Changes

**Principle**: Architectural changes require architectural solutions. When a problem spans multiple directives, fix the shared abstractions, not individual implementations. System-wide changes belong in `patterns/` or `core/`, never in individual directives.
