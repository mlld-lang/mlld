# Main Branch Analysis: Path Syntax Semantics

## Current State (Main Branch)

The main branch maintains a **clear semantic distinction** between brackets and quotes:

### Semantic Rules

1. **`[path/to/file]`** = Dereference operator ("load the contents")
   - Always loads file contents
   - Supports variable interpolation: `[@var/path/@file]`
   - Used in: `/add [file.md]`, `/text @content = [file.md]`

2. **`"string value"`** = String literal ("these characters")
   - Always a literal string
   - No file loading
   - Used in: `/text @name = "Alice"`, `/path @dir = "./docs"`

3. **No ambiguity** - Each syntax has ONE meaning

### Grammar Implementation

```peggy
// In patterns/content.peggy
PathStyleInterpolation "Path interpolation patterns"
  = InterpolatedPathContent  // [content with @var] - ONLY brackets allowed

// In directives/text.peggy
AtText
  // String literal - NO file loading
  / "@text" _ id _ "=" _ content:StringLiteral
  
  // Bracketed path - ALWAYS loads content
  / "@text" _ id _ "=" _ "[" parts:TextPathParts "]"
```

### Benefits of Main Branch Approach

1. **Semantic Clarity**: 
   - See `[...]` → Know it loads content
   - See `"..."` → Know it's a string

2. **No Context Needed**: 
   - Parser doesn't need to guess intent
   - No QuotedContentContext required

3. **Expressiveness**:
   ```mlld
   @text @configPath = "./config.json"    # Store path string
   @text @configData = [./config.json]    # Load file contents
   @data @settings = {
     "path": "./data.json",              # String value
     "content": [./data.json]            # Loaded content
   }
   ```

## New Grammar Branch Issues

The new grammar attempted to allow both:
- `"path/to/file"` could mean string OR load file
- Context determines meaning

This creates:
1. **Ambiguity**: `/text @x = "config.json"` - String or file contents?
2. **Complex Context Detection**: Need QuotedContentContext
3. **Lost Expressiveness**: Can't easily say "I want the string, not the contents"

## Recommendation

### Option 1: Full Rollback (Confidence: 95%)

Start fresh from main branch and reimplement ONLY:
- Directive prefix: `@` → `/`
- Command brackets: `[()]` → `{}`
- Comment syntax: `>>` → `//`

Keep:
- `[...]` = load/dereference
- `"..."` = string literal

### Option 2: Selective Restoration (Confidence: 85%)

In current branch, restore bracket semantics:
- Remove all quoted path loading patterns
- Enforce brackets for content loading
- Keep other changes

### Why Option 1 is Better

1. **Clean Foundation**: Main branch has working semantic model
2. **Less Risk**: Avoid inheriting other issues from new grammar
3. **Clear Path**: Know exactly what to change
4. **Proven Semantics**: The bracket/quote distinction works

## Implementation Plan for Option 1

### Phase 1: Setup
1. Create new branch from main
2. Plan minimal changes needed
3. Document semantic preservation

### Phase 2: Syntax Updates
1. Update directive markers: `@` → `/`
2. Update command brackets: `[()]` → `{}`  
3. Update comments: `>>` → `//`
4. Add quoted command syntax for /run

### Phase 3: Preserve Semantics
1. Keep `[...]` = dereference
2. Keep `"..."` = literal
3. No quoted path patterns
4. No context ambiguity

### Phase 4: Test & Validate
1. Verify AST unchanged (except surface syntax)
2. Ensure semantic clarity maintained
3. Confirm no context detection needed

## Critical Insights

The main branch's design embodies a key principle:
**Syntax should reflect semantics**

- `[]` brackets "embrace" content to load it
- `""` quotes "contain" literal text
- No magic, no guessing

This isn't just syntax - it's a semantic operator that makes intent visible.

## Conclusion

The attempt to "simplify" by allowing `"path"` to load files actually created complexity through ambiguity. The original design in main branch is superior because:

1. **Clear semantics**: One syntax, one meaning
2. **No context needed**: Parser is simpler
3. **User intent explicit**: Can distinguish "path string" vs "file contents"
4. **Aligns with philosophy**: Explicit over implicit

**Strong Recommendation**: Start fresh from main branch (Option 1) with confidence 95%.