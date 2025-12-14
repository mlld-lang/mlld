---
updated: 2025-12-12
tags: #lsp, #tooling, #testing
related-docs: docs/dev/LANGUAGE-SERVER.md
related-code: tests/utils/token-validator/*.ts, services/lsp/ASTSemanticVisitor.ts, services/lsp/utils/TokenBuilder.ts
related-types: tests/utils/token-validator/types.ts { CoverageGap, DiagnosticContext, TokenAttempt }
---

# LSP Semantic Token Validator

## tldr

AST-driven validation system that ensures every semantically meaningful AST node has corresponding semantic tokens. Eliminates false positives. Includes diagnostic tracing to show WHY tokens are missing (visitor not called, token rejected with reason, etc.). Critical for maintaining LSP highlighting quality.

**Status**: 100% coverage on 56 strict mode fixtures (1086/1086 nodes). Production files still have gaps.

## Principles

- **AST-driven expectations** - Each node type maps to expected token types via NodeTokenMap
- **Zero false positives** - Structural delimiters marked optional, whitespace skipped
- **Diagnostic transparency** - Track full pipeline: visitor call → token emission → acceptance/rejection
- **Actionable output** - Show which visitor file and method to fix, with rejection reasons
- **Double validation** - Fixtures pass 100%, but real files expose gaps → fixtures incomplete

## Details

### Commands

```bash
npm run validate:tokens                              # All fixtures, summary only
npm run validate:tokens -- --verbose                 # Add visitor coverage stats
npm run validate:tokens -- --verbose --diagnostics   # Add WHY diagnostics
npm run dump:tokens <file.mld> -- --diagnostics      # Single file with diagnostics
node scripts/validate-token-mappings.mjs             # Check TOKEN_TYPE_MAP completeness
```

### Core Flow

```
AST → NodeExpectationBuilder → expectations[]
AST → ASTSemanticVisitor → TokenBuilder → tokens[] + diagnostics[]
expectations[] + tokens[] → TokenMatcher → gaps[] [enriched with diagnostics]
gaps[] → CoverageReporter → terminal output
```

### Node Token Rules

**File**: `tests/utils/token-validator/NodeTokenMap.ts`

Defines expected token types for each AST node:
- `VariableReference` → `['variable', 'function']` (function when used in calls)
- `Directive` → `['keyword']`
- `BinaryExpression` → `['operator']`
- `Literal` → Dynamic based on valueType (number/string/boolean/null/keyword)
- `field` → `['property', 'function']` (function for method calls)

### Diagnostic System

Tracks token generation pipeline:

**TokenBuilder** (`services/lsp/utils/TokenBuilder.ts`):
- `addToken()` tracks ALL attempts as `TokenAttempt[]`
- Records: `{tokenType, position, accepted, rejectionReason, sourceNode}`
- Rejection reasons: `duplicate`, `negative_position`, `nan_value`, `unknown_type`
- Accessible via `getAttempts()`

**ASTSemanticVisitor** (`services/lsp/ASTSemanticVisitor.ts`):
- `visitNode()` tracks visitor calls as `VisitorDiagnostic[]`
- Records: `{visitorClass, nodeId, called, tokensEmitted, tokensAccepted, tokensRejected}`
- Sets source node via `tokenBuilder.setSourceNode(nodeId)` before visitor call
- Accessible via `getVisitorDiagnostics()`

**TokenCoverageValidator** (`tests/utils/token-validator/TokenCoverageValidator.ts`):
- Collects diagnostics from visitor and builder
- Correlates diagnostics to gaps by nodeId
- Each `CoverageGap` includes optional `diagnostic?: DiagnosticContext`

**CoverageReporter** (`tests/utils/token-validator/CoverageReporter.ts`):
- `formatDiagnosticTrace()` - Per-gap diagnostic output
- `generateDiagnosticSummary()` - Overall rejection statistics
- Shows visitor call status, token emission counts, rejection reasons

### Diagnostic Output Patterns

**Pattern 1: No visitor called**
```
✗ No visitor called
→ Register visitor in ASTSemanticVisitor.initializeVisitors()
→ OR add node type to existing visitor's switch statement
```

**Pattern 2: Visitor called, no tokens**
```
✓ CommandVisitor: 0 emitted, 0 accepted, 0 rejected
→ Visitor logic doesn't handle this node structure
→ Add tokenization logic to visitor method
```

**Pattern 3: Tokens rejected**
```
✓ VariableVisitor: 1 emitted, 0 accepted, 1 rejected
Token attempts:
  ✗ variable at 3:24 (negative_position)
→ Fix character position calculation in visitor
```

**Pattern 4: Tokens duplicated**
```
✓ StructureVisitor: 5 emitted, 0 accepted, 5 rejected (duplicate)
→ Node appears in AST multiple times
→ OR multiple visitors handling same position
→ Use visitedNodeIds deduplication or fix AST structure
```

**Pattern 5: Unknown type**
```
✗ function at 2:10 (unknown_type)
→ Add 'function': 'function' to TOKEN_TYPE_MAP
→ Run: node scripts/validate-token-mappings.mjs
```

### TOKEN_TYPE_MAP

**File**: `cli/commands/language-server-impl.ts:102-132`

Maps mlld-specific token names → standard LSP types:
- Custom types: `variableRef` → `variable`, `directive` → `keyword`
- Standard types pass through: `variable` → `variable`, `function` → `function`
- Missing mappings cause `unknown_type` rejection

Validate completeness: `node scripts/validate-token-mappings.mjs`

### Adding New Node Types

1. Add rule to `NodeTokenMap.ts`:
   ```typescript
   'MyNode': {
     expectedTokenTypes: ['keyword'],
     mustBeCovered: true,
     visitor: 'MyVisitor'
   }
   ```

2. Register in `ASTSemanticVisitor.ts:66-101`:
   ```typescript
   this.registerVisitor('MyNode', myVisitor);
   ```

3. Implement in visitor:
   ```typescript
   visitNode(node: any, context: VisitorContext): void {
     if (node.type === 'MyNode') {
       this.tokenBuilder.addToken({...});
     }
   }
   ```

4. If using custom token type, add to TOKEN_TYPE_MAP in `language-server-impl.ts`

### Entry Points

- **Validation**: `tests/utils/token-validator/TokenCoverageValidator.ts:33` - `validateFixture()`
- **Token generation**: `TokenCoverageValidator.ts:71` - `generateSemanticTokens()`
- **Gap detection**: `TokenCoverageValidator.ts:185` - `findCoverageGaps()`
- **Reporting**: `CoverageReporter.ts:23` - `generateReport()`
- **CLI**: `scripts/validate-tokens.mjs` - `main()`

## Gotchas

- **Test fixtures != production coverage** - Validator passes 100% on fixtures but real files expose edge cases. Always test production files with `npm run dump:tokens <file> -- --diagnostics`
- **TOKEN_TYPE_MAP required** - Every token type visitors emit MUST be in TOKEN_TYPE_MAP or tokens silently rejected with `unknown_type`
- **Visitor recursion** - ASTSemanticVisitor calls `visitChildren()` after every visitor. Manual recursion in visitors can cause duplicate tokens. Use `visitedNodeIds` deduplication or don't recurse manually.
- **sourceNode tracking** - TokenBuilder.setSourceNode() must be called before addToken() for diagnostics to correlate tokens to AST nodes
- **Diagnostic overhead** - Tracking adds ~5-10% performance overhead. Only enabled during validation, not in production LSP.
- **Nvim highlight group overrides hide theme colors** - When testing which semantic token type gives you a desired color, check that nvim config doesn't have `vim.api.nvim_set_hl(0, '@lsp.type.X.mld', ...)` overriding it. Example: `@lsp.type.modifier.mld → Keyword` will force modifier tokens to use Keyword color instead of the theme's natural modifier color. To use theme's default color for a semantic type, don't define a highlight group for it. Check: `grep "@lsp.type" cli/commands/nvim-setup.ts`

## Debugging

### Find why variable isn't highlighted

```bash
npm run dump:tokens file.mld -- --diagnostics
```

Look for the VariableReference node:
- `✗ No visitor called` → Add VariableVisitor call
- `✓ VariableVisitor: 0 emitted` → Visitor doesn't handle this pattern
- `✗ variable at X:Y (negative_position)` → Fix char calculation in VariableVisitor:134-145
- `✗ variable at X:Y (unknown_type)` → Add to TOKEN_TYPE_MAP

### Find duplicate token issues

```bash
npm run dump:tokens file.mld -- --diagnostics | grep duplicate
```

Shows which positions have duplicate tokens. Common causes:
- AST node appears multiple times with same nodeId
- Multiple visitors tokenizing same location
- Manual recursion + automatic visitChildren()

### Verify TOKEN_TYPE_MAP completeness

```bash
node scripts/validate-token-mappings.mjs
```

Exit code 1 if unmapped types found. Add to TOKEN_TYPE_MAP in `language-server-impl.ts:102-132`.

### Test real LSP (not just validator)

```bash
npm run test:nvim-lsp file.mld
```

Tests full pipeline including LSP protocol encoding. Catches issues validator can't:
- Invalid token positions that crash editors
- Parse errors preventing tokenization
- LSP protocol errors
