# AST-Driven Semantic Token Validator

Comprehensive validation system for LSP semantic token coverage that eliminates false positives by validating AST nodes against semantic tokens.

## Features

- **AST-node validation** - Validates each semantically meaningful AST node has corresponding tokens
- **Zero false positives** - Structural delimiters never flagged as missing
- **Actionable feedback** - Shows exactly which visitor file to fix and what method to add
- **Operator detection** - Finds operators (=>, =, ., |) between AST nodes
- **Fast iteration** - Run → see all gaps → fix → rerun
- **Mode-aware** - Handles strict mode (.mld) and markdown mode (.md)

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

Coverage: 842/950 nodes (88.6%)
Fixtures: 45 passed, 3 failed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 Top Issues (23 gaps)

1. field dot operator not tokenized (23 occurrences)

   📁 Fix in: /Users/adam/dev/mlld/services/lsp/visitors/StructureVisitor.ts
   🛠️ Helper:  OperatorTokenHelper

   Example from: feat/strict-mode/var-data-array
   Line 5: @user.name
                ^ Missing operator token

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Coverage by Visitor:

  DirectiveVisitor       234/238 (98.3%) ✓   4 gaps
  VariableVisitor        167/175 (95.4%) ✓   8 gaps
  StructureVisitor        45/68  (66.2%) ⚠️  23 gaps
```

## Architecture

### Core Components

- **TokenCoverageValidator** - Main orchestrator
- **NodeExpectationBuilder** - Builds expectations from AST
- **TokenMatcher** - Matches tokens to node locations
- **OperatorDetector** - Finds operators between nodes
- **FixSuggestionGenerator** - Maps gaps to visitor fixes
- **CoverageReporter** - Formats terminal output

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

### Add New Operator

Add to `OperatorDetector.ts`:

```typescript
{
  operator: '??',
  tokenType: 'operator',
  contexts: ['BinaryExpression'],
  findBetween: {
    leftNodeType: ['*'],
    rightNodeType: ['*']
  }
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
├── OperatorDetector.ts          - Finds operators between nodes
├── FixSuggestionGenerator.ts    - Maps gaps to fixes
├── VisitorMapper.ts             - Node types → visitor classes
├── CoverageReporter.ts          - Terminal output formatter
├── types.ts                     - TypeScript interfaces
└── index.ts                     - Exports
```

## Testing

```bash
# Run validator tests
npm test tests/utils/token-validator/TokenCoverageValidator.test.ts
```

## CI Integration

Add to CI pipeline:

```yaml
- name: Validate semantic token coverage
  run: npm run validate:tokens
```

This will fail the build if token coverage drops below 100%.
