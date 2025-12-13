# AST-Driven Semantic Token Validator

Comprehensive validation system for LSP semantic token coverage that eliminates false positives by validating AST nodes against semantic tokens.

## Current Status

**Strict Mode Fixtures**: 100% coverage (1058/1058 nodes), 53 passing, 0 failing ✅

**Production Files**: Still have issues - see epic [mlld-76c](../.beads/issues/mlld-76c.md) for tracking

The validator achieves 100% on test fixtures, but real files expose additional edge cases. Use `npm run test:nvim-lsp <file>` to test actual editor integration.

## Features

- **AST-node validation** - Validates each semantically meaningful AST node has corresponding tokens
- **Zero false positives** - Structural delimiters never flagged as missing
- **Actionable feedback** - Shows exactly which visitor file to fix and what method to add
- **Fast iteration** - Run → see all gaps → fix → rerun
- **Mode-aware** - Handles strict mode (.mld) and markdown mode (.md)
- **Comprehensive** - Validates against all 1,069 test fixtures automatically
- **Bug finder** - Already revealed critical bugs in `ASTSemanticVisitor.visitChildren()` recursion

## What the Validator Discovered

During initial testing, the validator revealed critical bugs in the LSP implementation:

1. **Missing visitor registrations** - `field`, `numericField`, `arrayIndex` node types weren't registered
2. **Incomplete AST traversal** - `visitChildren()` only checked specific properties (`values`, `children`, etc.) but didn't iterate ALL properties of container objects like `.values = { invocation: {...} }`
3. **Container object recursion** - Plain objects without `.type` property (like Directive `.values`) weren't being recursed into properly
4. **False 100% coverage** - Initially showed 100% because it wasn't walking into nested structures

These bugs meant that child nodes inside Directive `.values` containers (like variables, parameters, literals) were never visited and thus never tokenized.

### Critical Bugs Fixed

1. **Negative character positions** (`DirectiveVisitor.ts:340-365`) - `meta.implicit` was null for strict mode, causing wrong position calculations. Fixed by checking source text for `/` instead of trusting meta flag. This was **causing Neovim crashes** and malformed tokens.

2. **Missing visitor registrations** - `field`, `numericField`, `arrayIndex` weren't registered in `ASTSemanticVisitor.ts:87-89`

3. **Container object recursion** - `visitChildren()` now iterates ALL properties of plain objects without `.type`, properly handling Directive `.values` containers

4. **Wrong token types** - ExecInvocation sent as `variable` instead of `function` (`CommandVisitor.ts:142, 326`)

## Usage

### Basic Validation

```bash
# Validate all strict mode fixtures
npm run validate:tokens

# Validate with verbose output
npm run validate:tokens:verbose

# Validate specific fixture or pattern
npm run validate:tokens -- feat/strict-mode/variables
```

### Output Format

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Semantic Token Coverage Report - Strict Mode            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Coverage: 246/246 nodes (100.0%)
Fixtures: 56 passed, 0 failed

✅ All fixtures have complete token coverage!
```

## Architecture

### Core Components

- **TokenCoverageValidator** - Main orchestrator
- **NodeExpectationBuilder** - Builds expectations from AST
- **TokenMatcher** - Matches tokens to node locations
- **FixSuggestionGenerator** - Maps gaps to visitor fixes
- **CoverageReporter** - Formats terminal output
- **NodeTokenMap** - Defines expected tokens for each AST node type
- **ContextBuilder** - Tracks template/command context

### Node Type Mapping

The validator knows what each AST node type should generate:

```typescript
'VariableReference' → expects 'variable' token
'Directive' → expects 'keyword' token
'Parameter' → expects 'parameter' token
'Comment' → expects 'comment' token
'Literal' → expects 'number', 'keyword', or 'string' based on value type
```

### False Positive Elimination

- Structural delimiters (`[`, `]`, `{`, `}`, `:`, `,`) marked as optional
- Whitespace and newlines skipped
- Context-aware Text nodes (only require tokens inside templates)
- Mode-aware (markdown vs strict)

## Programmatic Usage

```typescript
import {
  TokenCoverageValidator,
  NodeExpectationBuilder,
  createNodeTokenRuleMap
} from './tests/utils/token-validator';

// Create validator
const nodeTokenRules = createNodeTokenRuleMap();
const expectationBuilder = new NodeExpectationBuilder(nodeTokenRules);
const validator = new TokenCoverageValidator(expectationBuilder);

// Validate a fixture
const result = await validator.validateFixture({
  name: 'feat/variables',
  input: 'var @name = "Alice"',
  ast: [...],
  mlldMode: 'strict'
});

console.log(`Coverage: ${result.coveragePercentage.toFixed(1)}%`);
console.log(`Gaps: ${result.gaps.length}`);
```

## Extending

### Add New Node Type

1. Add to `NodeTokenMap.ts`:

```typescript
'MyNewNode': {
  expectedTokenTypes: ['keyword'],
  mustBeCovered: true,
  visitor: 'MyVisitor'
}
```

2. Add to `VisitorMapper.ts`:

```typescript
'MyNewNode': {
  class: 'MyVisitor',
  file: 'services/lsp/visitors/MyVisitor.ts'
}
```

## Files

```
tests/utils/token-validator/
├── TokenCoverageValidator.ts   - Main orchestrator
├── NodeExpectationBuilder.ts   - Builds expectations from AST
├── TokenMatcher.ts              - Matches tokens to nodes
├── NodeTokenMap.ts              - Node type → token type rules
├── ContextBuilder.ts            - Tracks template/command context
├── FixSuggestionGenerator.ts    - Maps gaps to fixes
├── VisitorMapper.ts             - Node types → visitor classes
├── CoverageReporter.ts          - Terminal output formatter
├── types.ts                     - TypeScript interfaces
├── index.ts                     - Exports
└── README.md                    - This file
```

## Testing

```bash
# Run validator tests
npm test tests/utils/token-validator/TokenCoverageValidator.test.ts

# Test what Neovim actually receives from LSP
npm run test:nvim-lsp <file.mld>
npm run test:nvim-lsp:verbose <file.mld>
```

### Testing Real Editor Integration

The `test:nvim-lsp` script tests what the actual LSP server sends to Neovim:

```bash
# Test specific file (shows errors only)
npm run test:nvim-lsp <file.mld>

# Show all LSP activity
npm run test:nvim-lsp:verbose <file.mld>
```

**How it works:**
1. Opens file in Neovim headless
2. Waits for LSP to process (3 second timeout)
3. Captures LSP logs from `~/.local/state/nvim/lsp.log`
4. Filters for token errors and semantic activity
5. Shows summary with token count

**Example output:**
```
Summary:
  ✅ 247 tokens generated
  🔴 2 token position errors (these tokens were rejected)
  ⚠️  2 unknown node types (no visitors registered)
```

**Key difference from validator**: This tests the FULL LSP pipeline (parse → analyze → tokenize → encode → send), not just `ASTSemanticVisitor` in isolation. It reveals issues like:
- Invalid token positions that crash editors
- Parse errors preventing tokenization
- Unknown node types
- Diagnostic bugs

Use this to verify fixes work in actual editors before deploying.

## Known Issues

See epic **[mlld-76c](../../.beads/issues/mlld-76c.md)** for tracking all tokenization issues.

**Critical P0 issues:**
- [mlld-ghp](../../.beads/issues/mlld-ghp.md) - Negative token position causing failures
- [mlld-7t7](../../.beads/issues/mlld-7t7.md) - @variables not highlighted
- [mlld-ktr](../../.beads/issues/mlld-ktr.md) - @exe() calls not highlighted
- [mlld-kks](../../.beads/issues/mlld-kks.md) - False error on import with 'as' clause
- [mlld-08i](../../.beads/issues/mlld-08i.md) - Strings marked as invalid

**Lower priority:**
- [mlld-514](../../.beads/issues/mlld-514.md) - Bracket property access edge case
- [mlld-ddn](../../.beads/issues/mlld-ddn.md) - Object keys not highlighted
- [mlld-drm](../../.beads/issues/mlld-drm.md) - Comment highlighting inconsistent

## Known Limitations

1. **Visitor recursion inconsistency** - Some visitors (DirectiveVisitor, TemplateVisitor) manually recurse via `mainVisitor.visitNode()`, others don't. Automatic `visitChildren()` after visitor calls can cause duplicate tokens.

2. **Container object handling** - Directive nodes store children in `.values = { identifier: [...], params: [...], value: [...] }`. The validator now properly recurses into these, but some visitors may not expect to see their children visited automatically.

3. **Location quirks** - Some AST nodes have locations that span more than they should (e.g., VariableReference location includes the entire directive line instead of just `@name`)

4. **LSP diagnostic bug** - The LSP is currently sending diagnostics with `nil` line numbers, causing Neovim errors: `attempt to perform arithmetic on field 'line' (a nil value)`. This may interfere with semantic token generation and needs separate investigation.

5. **Highlighting instability** - Edits sometimes break highlighting that doesn't recover even when reverting to valid code. May be related to semantic token caching or diagnostic errors.

## Next Steps

✅ **Strict mode: 100% coverage achieved!**

Next:
1. **Test markdown mode** - Run validator on `.md` fixtures
2. **Add to CI** - Fail builds if coverage drops
3. **Test on real files** - Validate large production files like `~/dev/party/proto-3.7/llm/routes/orchestrate.mld`

## CI Integration

**Ready for CI!** Strict mode has 100% coverage:

```yaml
- name: Validate semantic token coverage
  run: npm run validate:tokens
```

This will fail builds if token coverage drops below 100%.
