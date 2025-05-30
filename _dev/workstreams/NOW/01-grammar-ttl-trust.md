# Grammar Updates for TTL and Trust

**Status**: Not Started  
**Priority**: P0 - Blocks all other security features  
**Estimated Time**: 2-3 days  

## Objective

Add TTL (Time To Live) and Trust syntax to the mlld grammar to enable inline security and caching policies.

## Syntax Specification

### TTL Syntax
```mlld
# Time-based cache control
@import { api } from @user/api-client (30m)      # 30 minutes
@text content = @url https://api.example.com/data (1h)   # 1 hour
@path config = [./config.json] (7d)              # 7 days
@add @url https://example.com/template.md (live)  # Always fetch fresh
@import { * } from [./local.mld] (static)         # Never refresh (default)
```

### Trust Syntax
```mlld
# Security trust levels
@import { risky } from @sketchy/module <trust never>
@run [curl https://api.com] <trust verify>       # Prompt user
@exec deploy() = @run [rm -rf /] <trust never>   # Block always
@path src = [/usr/local/bin] <trust always>      # Allow always
```

### Combined Syntax
```mlld
# Both TTL and Trust
@import { api } from @user/module (1h) <trust verify>
@text data = @url https://example.com (30m) <trust always>
```

## Grammar Changes Required

### 1. Base Token Patterns (`grammar/base/tokens.peggy`)
```peggy
// Add TTL tokens
TTLOption = "(" TTLValue ")"
TTLValue = TTLDuration / TTLSpecial
TTLDuration = Integer TTLUnit
TTLUnit = "s" / "m" / "h" / "d" / "w"
TTLSpecial = "live" / "static"

// Add Trust tokens  
TrustOption = "<" _ "trust" _ TrustLevel _ ">"
TrustLevel = "always" / "verify" / "never"

// Update SecurityOptions
SecurityOptions = (TTLOption _)? TrustOption? / TTLOption
```

### 2. Directive Updates

Each directive that supports URLs, paths, or imports needs to accept SecurityOptions:

#### Import Directive (`grammar/directives/import.peggy`)
```peggy
ImportSource = ModuleReference SecurityOptions? / PathExpression SecurityOptions?
ModuleReference = "@" ModuleIdentifier  
ModuleIdentifier = ModuleName ("@" ShortHash)?
ModuleName = Identifier "/" Identifier
ShortHash = [a-f0-9]{4,6}
```

#### Path Directive (`grammar/directives/path.peggy`)
```peggy
PathDirective = "@path" _ Identifier _ "=" _ PathExpression SecurityOptions?
```

#### Text Directive (`grammar/directives/text.peggy`)
```peggy
TextRHS = ... / URLReference SecurityOptions? / ...
```

#### Add Directive (`grammar/directives/add.peggy`)
```peggy
AddSource = ... / URLReference SecurityOptions? / PathReference SecurityOptions? / ...
```

### 3. AST Node Updates (`grammar/scripts/generate-types.mjs`)

Update type generation to include:
```typescript
interface SecurityOptions {
  ttl?: TTLOption;
  trust?: TrustLevel;
}

interface TTLOption {
  value: number; // seconds
  unit: 'live' | 'static' | 'seconds';
}

type TrustLevel = 'always' | 'verify' | 'never';
```

## Implementation Steps

### Phase 1: Grammar Foundation (Day 1)
1. [ ] Add TTL and Trust token patterns to `base/tokens.peggy`
2. [ ] Create `patterns/security-options.peggy` for reusable patterns
3. [ ] Update `mlld.peggy` main grammar file to include security patterns
4. [ ] Run `npm run build:grammar` and fix any parser generation errors

### Phase 2: Directive Integration (Day 1-2)
1. [ ] Update `import.peggy` to accept SecurityOptions
2. [ ] Update `path.peggy` to accept SecurityOptions  
3. [ ] Update `text.peggy` for URL references with SecurityOptions
4. [ ] Update `add.peggy` for URL/path references with SecurityOptions
5. [ ] Update `exec.peggy` and `run.peggy` for command trust levels

### Phase 3: AST and Types (Day 2)
1. [ ] Update `generate-types.mjs` to include SecurityOptions interfaces
2. [ ] Regenerate types with `npm run build:grammar`
3. [ ] Update AST factory methods if needed
4. [ ] Add type guards for SecurityOptions

### Phase 4: Testing (Day 2-3)
1. [ ] Create test cases in `tests/cases/valid/security/`
   - [ ] `ttl-basic.md` - Basic TTL examples
   - [ ] `trust-basic.md` - Basic trust examples
   - [ ] `ttl-trust-combined.md` - Combined usage
2. [ ] Create error cases in `tests/cases/invalid/security/`
   - [ ] `ttl-invalid-syntax.md` - Malformed TTL
   - [ ] `trust-invalid-level.md` - Invalid trust levels
3. [ ] Update `grammar/tests/` unit tests
4. [ ] Run `npm run build:fixtures` to generate test fixtures

### Phase 5: Editor Support (Day 3)
1. [ ] Update TextMate grammar in `editors/textmate/mlld.tmLanguage.json`
2. [ ] Update VSCode syntax highlighting
3. [ ] Update Vim syntax file
4. [ ] Test in each editor

## Validation Rules

1. **TTL Values**:
   - Numeric values must be positive integers
   - Units: s=seconds, m=minutes, h=hours, d=days, w=weeks
   - Special values: "live" (always fetch), "static" (never refresh)
   - Default: "static" for local files, 24h for URLs

2. **Trust Levels**:
   - `always`: Skip security checks
   - `verify`: Interactive approval required
   - `never`: Block execution/import
   - Default: `verify` for unknown sources

3. **Combinations**:
   - TTL and Trust are independent
   - Both can be specified in any order
   - Whitespace flexible: `(30m)<trust always>` or `(30m) <trust always>`

## Success Criteria

- [ ] Parser accepts all valid TTL/Trust syntax
- [ ] Parser rejects invalid syntax with clear errors
- [ ] AST includes SecurityOptions on relevant nodes
- [ ] All tests pass
- [ ] Syntax highlighting works in all editors
- [ ] No performance regression in parsing

## Notes

- TTL is about cache freshness (performance)
- Trust is about security policy (safety)
- Grammar should be permissive on whitespace
- Error messages should guide users to correct syntax
- Consider forward compatibility for future security options

## Related Documentation

### Architecture & Vision
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) - Overall system architecture including security integration points
- [`SECURITY-PRINCIPLES.md`](../../SECURITY-PRINCIPLES.md) - Core security philosophy and progressive trust model
- [`REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - Registry ecosystem vision including trust mechanisms

### Specifications
- [`specs/ttl-trust-syntax.md`](../../specs/ttl-trust-syntax.md) - Detailed TTL and Trust syntax specification
- [`specs/import-syntax.md`](../../specs/import-syntax.md) - Import directive syntax including security options
- [`specs/lock-file-format.md`](../../specs/lock-file-format.md) - How TTL/Trust decisions are persisted