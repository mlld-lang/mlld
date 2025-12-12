# AST-Driven Semantic Token Validator

Comprehensive validation system for LSP semantic token coverage that eliminates false positives by validating AST nodes against semantic tokens.

## Current Status

**Strict Mode**: 96.0% coverage (1016/1058 nodes), 14 fixtures failing, 39 passing
**Main Issues**: ExecInvocation nodes (24 gaps), field/numericField nodes (16 gaps), Literal nodes (2 gaps)

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

### Fixes Applied

- Added `field`, `numericField`, `arrayIndex` visitor registrations to `ASTSemanticVisitor.ts:87-89`
- Updated `visitChildren()` to recurse into container objects: checks if object has `.type`, if not, iterates all its properties
- Fixed `NodeExpectationBuilder` to use same container recursion logic

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
```

## Known Limitations

1. **Visitor recursion inconsistency** - Some visitors (DirectiveVisitor, TemplateVisitor) manually recurse via `mainVisitor.visitNode()`, others don't. Automatic `visitChildren()` after visitor calls can cause duplicate tokens.

2. **Container object handling** - Directive nodes store children in `.values = { identifier: [...], params: [...], value: [...] }`. The validator now properly recurses into these, but some visitors may not expect to see their children visited automatically.

3. **Location quirks** - Some AST nodes have locations that span more than they should (e.g., VariableReference location includes the entire directive line instead of just `@name`)

4. **LSP diagnostic bug** - The LSP is currently sending diagnostics with `nil` line numbers, causing Neovim errors: `attempt to perform arithmetic on field 'line' (a nil value)`. This may interfere with semantic token generation and needs separate investigation.

5. **Highlighting instability** - Edits sometimes break highlighting that doesn't recover even when reverting to valid code. May be related to semantic token caching or diagnostic errors.

## Next Steps

To reach 100% coverage (currently at 96.0%):

1. **Fix ExecInvocation** gaps (24 occurrences) - CommandVisitor.visitExecInvocation() is called but may not tokenize in all cases
2. **Fix field/numericField** gaps (16 occurrences) - StructureVisitor needs to handle these node types
3. **Fix Literal** gaps (2 occurrences) - LiteralVisitor edge cases

Most gaps are now fixed! Down from 183 to 42 gaps.

## CI Integration

**Do NOT add to CI yet** - coverage is 96.0%, will fail builds. Once 100% is reached:

```yaml
- name: Validate semantic token coverage
  run: npm run validate:tokens
```
