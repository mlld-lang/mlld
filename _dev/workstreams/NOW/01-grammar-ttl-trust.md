# Grammar Updates for TTL, Trust, and Module System

**Status**: Not Started  
**Priority**: P0 - Blocks all other security features  
**Estimated Time**: 3-4 days  

## Objective

Update the mlld grammar to support:
1. TTL (Time To Live) and Trust syntax for security/caching
2. Extended module syntax for resolver system
3. Frontmatter parsing for metadata
4. @stdin → @input rename for future extensibility
5. @output directive for multi-output scripts

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

### Trust Syntax (No Angle Brackets)
```mlld
# Security trust levels - parentheses syntax
@import { risky } from @sketchy/module trust never
@run [curl https://api.com] trust verify          # Prompt user
@exec deploy() = @run [rm -rf /] trust never     # Block always
@path src = [/usr/local/bin] trust always        # Allow always
```

### Combined Syntax
```mlld
# Both TTL and Trust - no angle brackets
@import { api } from @user/module (1h) trust verify
@text data = @url https://example.com (30m) trust always
```

### @output Directive (New)
```mlld
# Output routing to resolvers
@output @result to @storage/reports/daily.json
@output @data to file [./output.xml] as xml
@output @report to @run @uploadCommand

# Multiple outputs in one script
@output @summary to @logs/summary.txt
@output @full to @archive/full-report.json
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

// Add Trust tokens - NO ANGLE BRACKETS
TrustOption = "trust" _ TrustLevel
TrustLevel = "always" / "verify" / "never"

// Update SecurityOptions
SecurityOptions = (TTLOption _)? (TrustOption)? / TTLOption
```

### 2. Directive Updates

Each directive that supports URLs, paths, or imports needs to accept SecurityOptions:

#### Import Directive (`grammar/directives/import.peggy`)
```peggy
ImportSource = ModuleReference SecurityOptions? / PathExpression SecurityOptions? / InputReference SecurityOptions?
ModuleReference = "@" ModuleIdentifier  
ModuleIdentifier = ModuleNamespace ("/" ModulePath)* "/" ModuleName ("@" ShortHash)?
ModuleNamespace = Identifier
ModulePath = Identifier  
ModuleName = Identifier
ShortHash = [a-f0-9]{4,}
InputReference = "@input"  // Renamed from @stdin
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

### 3. Output Directive (`grammar/directives/output.peggy`)
```peggy
OutputDirective = "@output" _ Variable _ "to" _ OutputTarget ("as" _ OutputFormat)?
OutputTarget = ResolverPath / FileOutput / CommandOutput
ResolverPath = "@" ResolverPrefix "/" Path+
FileOutput = "file" _ PathExpression
CommandOutput = "@run" _ CommandReference
OutputFormat = "md"/"markdown"/"text"/"txt" | "json" | "xml" | "yaml"/"yml" | "csv"
```

### 4. Frontmatter Support (`grammar/base/frontmatter.peggy`)
```peggy
Frontmatter = "---" _ NewLine FrontmatterContent "---" _ NewLine
FrontmatterContent = (!"---" .)*

// Main document starts with optional frontmatter
Document = Frontmatter? Body
```

### 5. AST Node Updates (`grammar/scripts/generate-types.mjs`)

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

interface ModuleReference {
  type: 'ModuleReference';
  namespace: string;
  path?: string[];
  name: string;
  hash?: string; // Short hash for content addressing
  security?: SecurityOptions;
}

interface OutputDirective {
  type: 'OutputDirective';
  source: Variable;
  target: OutputTarget;
  format?: OutputFormat;
}

type OutputTarget = ResolverPath | FileOutput | CommandOutput;
type OutputFormat = 'json' | 'xml' | 'yaml' | 'text';

interface FrontmatterNode {
  type: 'Frontmatter';
  content: string;
  data?: any; // Parsed YAML
}
```

## Implementation Steps

### Phase 1: Grammar Foundation (Day 1)
1. [ ] Add TTL and Trust token patterns to `base/tokens.peggy`
2. [ ] Create `patterns/security-options.peggy` for reusable patterns
3. [ ] Create `base/frontmatter.peggy` for YAML frontmatter
4. [ ] Update module syntax for extended paths (@resolver/path/to/module)
5. [ ] Rename @stdin to @input throughout
6. [ ] Add @output directive pattern
7. [ ] Update `mlld.peggy` main grammar file
8. [ ] Run `npm run build:grammar` and fix any parser generation errors

### Phase 2: Directive Integration (Day 1-2)
1. [ ] Update `import.peggy` to accept SecurityOptions
2. [ ] Update `path.peggy` to accept SecurityOptions  
3. [ ] Update `text.peggy` for URL references with SecurityOptions
4. [ ] Update `add.peggy` for URL/path references with SecurityOptions
5. [ ] Update `exec.peggy` and `run.peggy` for command trust levels
6. [ ] Create `output.peggy` for @output directive

### Phase 3: AST and Types (Day 2-3)
1. [ ] Update `generate-types.mjs` to include SecurityOptions interfaces
2. [ ] Add ModuleReference types with namespace/path/name
3. [ ] Add FrontmatterNode type
4. [ ] Regenerate types with `npm run build:grammar`
5. [ ] Update AST factory methods if needed
6. [ ] Add type guards for new node types

### Phase 4: Testing (Day 3-4)
1. [ ] Create test cases in `tests/cases/valid/security/`
   - [ ] `ttl-basic.md` - Basic TTL examples
   - [ ] `trust-basic.md` - Basic trust examples (no angle brackets)
   - [ ] `ttl-trust-combined.md` - Combined usage
2. [ ] Create module syntax tests
   - [ ] `module-extended-paths.md` - @resolver/path/to/module
   - [ ] `module-hash-syntax.md` - @user/module@abc123
   - [ ] `input-import.md` - @import from @input
3. [ ] Create frontmatter tests
   - [ ] `frontmatter-basic.md` - YAML parsing
   - [ ] `frontmatter-import.md` - Import with frontmatter
   - [ ] `frontmatter-variables.md` - Access via @fm.*
4. [ ] Create output directive tests
   - [ ] `output-resolver.md` - Output to resolvers
   - [ ] `output-multiple.md` - Multiple outputs
   - [ ] `output-formats.md` - Different output formats
5. [ ] Create error cases in `tests/cases/invalid/`
6. [ ] Update `grammar/tests/` unit tests
7. [ ] Run `npm run build:fixtures` to generate test fixtures

### Phase 5: Editor Support (Day 4)
1. [ ] Update TextMate grammar in `editors/textmate/mlld.tmLanguage.json`
2. [ ] Add frontmatter region support
3. [ ] Update module syntax highlighting
4. [ ] Update VSCode syntax highlighting
5. [ ] Update Vim syntax file
6. [ ] Test in each editor

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
   - Whitespace flexible: `(30m) trust always` or `(30m)trust always`
   - NO angle brackets in trust syntax

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
- NO angle brackets in trust syntax - use plain keywords
- Extended module paths enable custom resolvers: @resolver/path/to/module
- @output directive enables multi-output scripts and output sandboxing
- Frontmatter is always optional, never required
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
