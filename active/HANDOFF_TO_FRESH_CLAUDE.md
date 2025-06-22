# Handoff: Grammar Syntax Update from Main Branch

## Context for Fresh Claude

You're working on the mlld grammar to update surface syntax while preserving semantic behavior. A previous attempt created problems by changing semantics, so we're starting fresh from the `main` branch.

## Your Mission

Update the mlld grammar with new syntax:
- Directive prefix: `@` → `/` (e.g., `@run` → `/run`)
- Command brackets: `[()]` → `{}` (e.g., `[(echo)]` → `{echo}`)
- Comments: `>>` → `//`
- Add quoted command syntax: `/run "echo hello"`

**CRITICAL**: Preserve the semantic distinction where `[...]` = load/dereference content and `"..."` = literal string.

## Key Documents to Read (in order)

### 1. PATH_SYNTAX_SEMANTIC_CLARITY.md
**Read this first** - Explains why `[path]` vs `"path"` distinction is critical. This is NOT just syntax preference - it's a semantic operator:
- `[file.md]` = "load the contents of file.md"
- `"file.md"` = "the string 'file.md'"

This distinction eliminates ambiguity and makes the grammar simpler.

### 2. MAIN_BRANCH_ANALYSIS.md
Shows why we're starting from main branch instead of fixing the previous attempt. The previous branch lost the semantic distinction and created complexity.

### 3. ROLLBACK_IMPLEMENTATION_GUIDE.md
Your step-by-step implementation guide. Follow this to:
1. Create new branch from main
2. Update directive markers
3. Update command brackets
4. Add quoted commands
5. Update comments

**Key sections**:
- "What NOT to Do" - Critical preservation rules
- "Testing Strategy" - Verify semantic preservation

### 4. SEMANTIC_FORK_UPDATES_V2.md
Complete parse tree documentation showing how each directive should work with new syntax. Use this to understand the semantic forking for each directive.

**Key insight**: Notice how `[...]` consistently means "load content" across all directives, while `"..."` always means "literal string".

### 5. GRAMMAR_README_PARSE_TREES_UPDATE.md
Ready-to-paste documentation for `grammar/README.md`. After implementing changes, use this to update the parse tree documentation.

## Implementation Strategy

### Phase 1: Setup (30 min)
```bash
git checkout main
git checkout -b new-grammar-v3
```

### Phase 2: Simple Updates (3-4 hours)

1. **Update Directive Markers**
   ```peggy
   // In all grammar/directives/*.peggy files
   DirectiveContext "@text"  →  DirectiveContext "/text"
   ```

2. **Update Command Brackets**
   ```peggy
   // In patterns/unified-run-content.peggy
   "[(" ... ")]"  →  "{" ... "}"
   ```

3. **Update Comments**
   ```peggy
   // In patterns/comments.peggy
   ">>"  →  "//"
   ```

### Phase 3: Add Quoted Commands (2-3 hours)

Add to `/run` directive:
```peggy
/ DirectiveContext "/run" _ cmd:QuotedCommand {
    // Handle "echo hello" or 'echo hello'
  }
```

### Phase 4: Test Semantic Preservation (1-2 hours)

**Critical tests**:
```mlld
# These MUST work exactly as in main branch:
/text @path = "config.json"      # String: "config.json"
/text @data = [config.json]       # Contents of file

/add "See README.md"              # Output: "See README.md"
/add [README.md]                  # Output: contents of README.md
```

## What Makes This Simple

The main branch has the right design:
- `[...]` = semantic operator for "load/dereference"
- `"..."` = always literal string
- No ambiguity, no complex context detection needed

Previous attempt tried to make `"path"` sometimes load files based on context, creating massive complexity. By preserving the semantic operators, the implementation is straightforward.

## Red Flags to Avoid

1. **Never add**: Quoted paths that load files
   ```peggy
   // ❌ NEVER: /add "file.md" loading file contents
   // ✅ ALWAYS: /add "file.md" outputs text "file.md"
   ```

2. **Never create**: Context-dependent string interpretation
   ```peggy
   // ❌ NEVER: "file.md" means different things in different places
   // ✅ ALWAYS: "file.md" is always a literal string
   ```

3. **Never change**: The bracket dereference semantics
   ```peggy
   // ✅ ALWAYS: [anything] means load/dereference
   ```

## Success Criteria

1. All syntax updated (/, {}, //)
2. Semantic model preserved ([]=load, ""=string)
3. No new context detection needed
4. Tests pass with unchanged behavior
5. Parse trees in README updated

## Time Estimate

- Total: 1-2 days
- Most time on testing, not implementation
- If it feels complex, you're probably changing semantics

## Final Advice

This is a SIMPLE syntax update because main branch has the right semantic model. Trust the bracket/quote distinction - it's brilliant design that makes everything else simple.

If you find yourself:
- Adding context detection for quotes
- Making quotes sometimes load files
- Creating parsing ambiguity

STOP. You're changing semantics, not just syntax. Go back to the main branch design.

Good luck! The semantic operators make this much simpler than it might initially appear.