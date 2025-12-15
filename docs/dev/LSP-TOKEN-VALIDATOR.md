---
updated: 2025-12-15
tags: #lsp, #tooling, #testing
related-docs: docs/dev/LANGUAGE-SERVER.md
related-code: tests/utils/token-validator/*.ts, services/lsp/ASTSemanticVisitor.ts, services/lsp/utils/TokenBuilder.ts
related-types: tests/utils/token-validator/types.ts { CoverageGap, DiagnosticContext, TokenAttempt }
---

# LSP Semantic Token Validator

## tldr

AST-driven validation system that ensures every semantically meaningful AST node has corresponding semantic tokens. Includes `requireExactType` flag to distinguish semantic nodes (Parameter, Directive) from structural nodes. Diagnostic tracing shows WHY tokens are missing (visitor not called, token rejected with reason, wrong token type, etc.). Critical for maintaining LSP highlighting quality.

**Status**: 96.2% coverage on 56 strict mode fixtures (1045/1086 nodes), 51 fixtures passing. Enhanced with requireExactType flag - wrong-type tokens on critical nodes now counted as errors.

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

**requireExactType Flag** (added 2025-12-14):

Node rules can include `requireExactType: true` to distinguish semantic nodes from structural nodes:

```typescript
'Parameter': {
  expectedTokenTypes: ['parameter'],
  mustBeCovered: true,
  requireExactType: true,  // Wrong type = ERROR not warning
  visitor: 'FileReferenceVisitor'
}
```

When `requireExactType: true`:
- Wrong token type creates **error gap** (counts in coverage %)
- Example: Parameter node with overlapping `operator` token = error

When `requireExactType: false` or not set:
- Wrong token type creates **warning gap** (doesn't count in coverage %)
- Example: VariableReference can be `variable` OR `function` token

This prevents false positives like operator tokens `(`, `,`, `)` overlapping Parameter nodes and being counted as "covered".

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
- **Visitor recursion** - ASTSemanticVisitor calls `visitChildren()` after every visitor (line 202). Manual recursion in visitors can cause duplicate tokens. Use early returns or visitedNodeIds deduplication.
- **Missing visitor registration** - Adding `canHandle()` to visitor without `registerVisitor()` in ASTSemanticVisitor.initializeVisitors() causes silent skipping. Both required.
- **Broken AST locations** - exe function identifiers have locations spanning entire directive (offset 0-end). Filter suspicious spans (>50 chars) to prevent duplicate tokens from wrong @ symbol searches.
- **Parse errors corrupt tokenization** - Invalid syntax triggers error recovery producing broken AST. Highlighting issues often caused by upstream syntax errors, not tokenization bugs.
- **LSP protocol corruption** - `console.log()` writes to stdout, breaking JSON-RPC. Use `console.error()` for stderr or `connection.console.log()` for LSP channel.
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

### Validator passes but editor doesn't highlight

If validator shows 100% coverage but elements aren't highlighted in the editor:

1. **Check highlight group overrides**:
   ```bash
   grep "@lsp.type" cli/commands/nvim-setup.ts
   ```
   Highlight groups like `@lsp.type.parameter.mld → Identifier` override the theme's natural color for that semantic type.

2. **Verify config regeneration**:
   ```bash
   npm run build
   mlld nvim-setup --force
   # Check that config was written:
   grep "@lsp.type.parameter" ~/.config/nvim/lua/plugins/mlld.lua
   ```

3. **Completely restart editor** - Reload window is not enough, need full restart for LSP server changes

4. **Check if highlight group exists**:
   In vim: `:hi Function` - should show a color definition
   If "cleared" or empty, that group doesn't exist in your theme

5. **Test with DEBUG_LSP**:
   ```bash
   DEBUG_LSP=true npm run dump:tokens file.mld 2>&1 | grep "\[TOKEN\]"
   ```
   Confirms tokens are being generated with correct types

### Testing semantic token colors in your theme

When you need to find which semantic token type gives you a specific color:

1. **Temporarily modify code** to use test token types:
   ```typescript
   // In DirectiveVisitor.ts
   private getDirectiveTokenType(kind: string): string {
     switch (kind) {
       case 'var': return 'testTokenMacro';     // Test 'macro' color
       case 'exe': return 'testTokenDecorator'; // Test 'decorator' color
       case 'guard': return 'testTokenModifier'; // Test 'modifier' color
       default: return 'directive';
     }
   }
   ```

2. **Add test types to TOKEN_TYPES and TOKEN_TYPE_MAP**:
   ```typescript
   // In language-server-impl.ts
   const TOKEN_TYPES = [..., 'macro', 'decorator', 'modifier'];
   const TOKEN_TYPE_MAP = {
     ...
     'testTokenMacro': 'macro',
     'testTokenDecorator': 'decorator',
     'testTokenModifier': 'modifier'
   };
   ```

3. **Build and test**:
   ```bash
   npm run build
   mlld nvim-setup --force
   # Restart editor completely
   # Open test file and see which directive has the color you want
   ```

4. **DON'T define highlight groups for test types** - Let theme's natural colors show through

5. **Record results**, then implement the winner

**Example**: We found `modifier` semantic type → pink italic by testing guard directive.

### Common highlighting issues and solutions

**Issue**: Element tokens generated but shows as default/no color
- **Check**: Highlight group exists for that semantic type
- **Solution**: Either define highlight group or use a different semantic type

**Issue**: Wrong color despite correct token type
- **Check**: `grep "@lsp.type.X.mld" cli/commands/nvim-setup.ts`
- **Solution**: Remove highlight group override to use theme's natural color

**Issue**: Color testing showed different color than in actual use
- **Cause**: Added highlight group override after color test
- **Solution**: Don't define highlight group for semantic types you want theme to handle

**Issue**: Parameters work in declarations but not in function call arguments
- **Check**: Are arguments in AST? `npm run ast file.mld | grep -A10 args`
- **Common cause**: `hasValidName` check fails for computed property calls, args array never visited
- **Solution**: Add fallback to visit args even when name is an object (not string)

**Issue**: Position off by one or two characters
- **Cause**: Column-based arithmetic (`column + offset`) instead of offset-based search
- **Solution**: Use `indexOf('@' + identifier, startOffset)` then `positionAt(offset)`
- **See**: VariableVisitor.ts handleRegularReference() for correct pattern

**Issue**: Element in bracket expression like `[@var.field]` not highlighted
- **Cause**: AST location doesn't include `@`, column arithmetic breaks
- **Solution**: Search forward for `@` from node location (offset-based)

**Issue**: Text nodes not highlighting (strings appear as default color)
- **Check**: Is 'Text' registered? `grep "registerVisitor('Text'" services/lsp/ASTSemanticVisitor.ts`
- **Cause**: Adding `canHandle(node.type === 'Text')` without registering in visitor map
- **Solution**: Add `this.registerVisitor('Text', templateVisitor)` to initializeVisitors()

**Issue**: Duplicate/overlapping tokens at wrong positions
- **Check**: `tail -f ~/.local/state/nvim/lsp.log | grep "duplicate\|TOKEN-ERROR"`
- **Common cause**: Visitor returns early but ASTSemanticVisitor.visitChildren() runs anyway (line 202)
- **Solution**: Add early returns after visitTemplateValue/visitInlineCode to skip visitChildren()

**Issue**: Strings highlight inconsistently (green in some contexts, not others)
- **Check AST**: `npm run ast -- '/when @x > 0 => show "text"'` - Does nested show have meta.wrapperType?
- **Cause**: Nested show directives in for/when lack wrapperType in meta
- **Solution**: Infer wrapperType from source text when meta doesn't have it

**Issue**: Parse errors cause broken/missing highlighting
- **Check**: Look for syntax errors first - are you using invalid syntax?
- **Symptom**: Validator shows gaps that appear/disappear with minor syntax changes
- **Solution**: Fix syntax errors. Error recovery produces broken AST with wrong locations.

**Issue**: Overlapping tokens with higher priority win (wrong color shows)
- **Check**: `:Inspect` in nvim shows multiple semantic tokens at position
- **Debugging**: Add logging to TokenBuilder.addToken() for specific line numbers
- **Common cause**: Visitor with broken location search finds wrong @ symbol, tokenizes at wrong position
- **Solution**: Filter suspicious location spans or use deduplication

### Required workflow for highlighting changes

All three steps are REQUIRED for changes to take effect:

```bash
# 1. Build
npm run build

# 2. Regenerate editor config
mlld nvim-setup --force

# 3. COMPLETELY restart editor (not just reload window)
# - VSCode: Quit and reopen
# - Vim: Exit completely and restart
```

Skipping any step will result in old highlighting behavior persisting.
