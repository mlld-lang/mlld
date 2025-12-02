---
updated: 2025-12-01
tags: #docs, #llm, #llms-txt
related-docs: docs/dev/DOCS.md, docs/dev/USERDOCS.md
related-code: llms.txt
---

# llms.txt Maintenance Guide

## tldr

llms.txt is the canonical reference for LLMs writing mlld syntax. It uses a pseudo-XML structure with markdown content for optimal LLM comprehension - tags provide navigation while examples remain scannable. Update when syntax changes, new features ship, or common LLM mistakes are identified.

## Principles

- **Optimize for LLM comprehension** - Structure that LLMs can navigate via tags while keeping examples scannable
- **Example-driven** - Every feature needs working code with ❌/✅ patterns
- **Present tense only** - No "this used to" or future promises, document current syntax
- **Deduplication is critical** - Consolidate similar concepts to avoid conflicting guidance
- **Ordering matters** - Most common/important patterns first within each section
- **Cross-reference explicitly** - Link related sections clearly (e.g., "Full details in <CONTROL_FLOW>")
- **Terse and pragmatic** - Include only what's critical; respect LLM context windows
- **Tested examples** - Every code block must be valid, tested mlld syntax

## Structure

### Pseudo-XML Framework

llms.txt uses lightweight pseudo-XML tags as section markers while keeping markdown content format.

**Tag naming:** ALL_CAPS_UNDERSCORES for clear visual distinction
- Section tags: `<COMMANDS>`, `<SYNTAX>`, `<CONTROL_FLOW>`
- Rule tags: `<RULE_1_DIRECTIVES_START_LINES>`, `<RULE_2_VARIABLE_SYNTAX>`
- Mistake tags: `<MISTAKE_FILE_VS_STRING>`, `<MISTAKE_NESTED_FUNC_CALLS>`

**Content format:**
- Simple opening/closing tags like `<SECTION_NAME>...</SECTION_NAME>`
- Markdown content inside (headers, lists, code blocks)
- Maximum 2 levels of nesting for readability
- Code blocks remain as markdown fenced blocks (```mlld)
- No attributes needed - tag names are self-documenting

**Detection rule:** Only `<...>` containing `.`, `/`, `*`, or `@` are treated as file references in mlld. XML-like `<TAG>` is safe as plain text. This allows pseudo-XML structure without conflicting with mlld syntax.

### Section Organization

The TOC at the top provides structure overview. Main sections:

- **`<OVERVIEW>`** - Purpose, execution modes, "What mlld IS/ISN'T," mental model shift
- **`<CORE_RULES>`** - Fundamental rules (12 numbered rules covering directives, variables, commands, output, interpolation, field access, parameterized content, file loading, imports, when, iteration, operators)
- **`<SYNTAX>`** - Detailed syntax for variables, templates, file loading, pipelines, comments, reserved variables
- **`<COMMANDS>`** - Command directives: run vs run sh, /exe, /output, /log, /append, streaming
- **`<CONTROL_FLOW>`** - /when decisions, iteration (foreach, /for), no early exit pattern
- **`<MODULES>`** - Module philosophy, imports, exports, shadow environments, local dev
- **`<PATTERNS>`** - Tool orchestration, data pipelines, conditional workflows, guarded execution
- **`<CONFIGURATION>`** - Environment variables, frontmatter, paths, resolvers, registry, publishing
- **`<COMMON_MISTAKES>`** - Individual mistake tags with ❌/✅ examples
- **`<REFERENCE>`** - Quick lookup tables, execution context, syntax summary
- **`<SECURITY>`** - Guards, data labels, policies
- **`<STREAMING>`** - Streaming execution patterns
- **`<SEE_ALSO>`** - External documentation links

### When to Update Each Section

**OVERVIEW** - Rarely. Only when core philosophy or mental model changes.

**CORE_RULES** - When adding truly fundamental syntax that's required for basic understanding. High bar for additions.

**SYNTAX** - When adding new syntax features (operators, field access patterns, etc.)

**COMMANDS** - When adding new directives or significantly changing existing ones.

**CONTROL_FLOW** - When changing /when, /for, foreach behavior.

**MODULES** - When changing import/export syntax or module resolution.

**PATTERNS** - When identifying new best-practice patterns from user code.

**CONFIGURATION** - When adding config options, resolver types, or registry features.

**COMMON_MISTAKES** - Frequently. Add whenever you identify repeated LLM errors.

**REFERENCE** - When syntax tables need updates for new features.

## Adding New Content

### New Features

**Decision tree for placement:**

1. Is it fundamental to basic understanding? → `<CORE_RULES>` (brief) + detailed section
2. Is it a directive? → `<COMMANDS>` or `<CONTROL_FLOW>`
3. Is it syntax? → `<SYNTAX>` with appropriate subsection
4. Is it a pattern/practice? → `<PATTERNS>`
5. Is it configuration? → `<CONFIGURATION>`

**Example structure template:**

```markdown
<FEATURE_NAME>
Brief 1-2 sentence description.

```mlld
# Basic example
/show "Hello"

# With options
/show "Hello" with { format: "json" }
```

Notes/caveats if needed.
</FEATURE_NAME>
```

**Core rules threshold:** Only add to CORE_RULES if the feature is:
- Used in >50% of mlld scripts
- Required for basic comprehension
- Fundamentally changes how LLMs should think about mlld

Otherwise, put overview in appropriate section and detailed coverage in subsections.

**Versioning:** Update the version in `<MLLD_GUIDE version="X.Y.Z">` at the top when making significant additions.

### Common LLM Mistakes

**Identifying patterns:**
- Monitor GitHub issues for syntax errors
- Review error logs for repeated patterns
- Watch for questions in discussions/support
- Test LLM outputs for systematic errors

**MISTAKE tag naming:**
- Descriptive: `<MISTAKE_MISSING_AT>`, not `<MISTAKE_1>`
- Action-focused: What they're doing wrong
- Examples: `<MISTAKE_USING_AT_FOR>`, `<MISTAKE_INTERPOLATION>`, `<MISTAKE_FILE_VS_STRING>`

**Required elements:**
```markdown
<MISTAKE_DESCRIPTIVE_NAME>
Brief explanation of the mistake.

```mlld
❌ /var greeting = "Hello"    # wrong
✅ /var @greeting = "Hello"   # correct
```

Optional: why this is wrong or additional context.
</MISTAKE_DESCRIPTIVE_NAME>
```

**Ordering:** Place most common mistakes first in the section. Reorder as patterns shift.

### Syntax Additions

**Progressive disclosure pattern:**
- Brief mention in CORE_RULES (if fundamental)
- Detailed coverage in dedicated section
- Full reference in REFERENCE tables

**Example:** Field access
- CORE_RULES: "Objects/arrays use dot+index"
- SYNTAX/FIELD_ACCESS: Full examples with slicing, builtin methods, edge cases
- REFERENCE: Quick lookup table

**Balancing completeness vs conciseness:**
- Include common cases (80% usage)
- Use "Advanced:" or subsections for edge cases
- Link to docs/user/* for exhaustive coverage
- Avoid redundant explanations across sections

## Updating Existing Content

### Deduplication

**Strategy:**
1. Identify redundant explanations (grep for duplicated examples)
2. Choose canonical location (most specific section)
3. Keep brief overview in general section
4. Add cross-reference to detailed section

**Example - run vs run sh guidance:**
- Before: Explained in multiple places with conflicting advice
- After: All guidance in `<RUN_VS_RUN_SH>` with decision tree
- Brief mention in CORE_RULES: "Every command needs braces"

**Cross-reference format:**
```markdown
/when drives decisions. Full details in <CONTROL_FLOW>.
```

### Improving Examples

**Replace generic with realistic:**

❌ Bad:
```mlld
/var @foo = "bar"
/var @baz = @foo
```

✅ Good:
```mlld
/var @userName = "Alice"
/var @greeting = `Hello @userName`
```

**Add output when helpful:**

```mlld
/var @result = run {echo "hello"} | @upper
/show @result
# Output: HELLO
```

**Test all examples:**
- Use `npm run ast -- 'code'` to verify parsing
- Create temp test files for multi-line examples
- Ensure examples match current syntax (not deprecated)

**Balance brevity with clarity:**
- Simplest case first
- Add complexity incrementally within same feature
- Use comments (`>>`, `<<`) for non-obvious behavior
- Don't over-explain what's visible in the code

### Clarifying Ambiguity

**Decision trees for "X vs Y" questions:**

```markdown
Decision tree:
* Single line + pipes only (`|`) → `run { … }`
* Needs `&&`, `||`, control flow → `run sh { … }`
* JavaScript (no shell) → `js { … }`
```

**Comparison tables:**

```markdown
| Syntax | Interpolation | Pipes | Use For |
|--------|---------------|-------|---------|
| `::...::` | `@var` | ✓ | **Default** |
| `:::...:::` | `{{var}}` | ✗ | Discord only |
```

**When LLMs generate incorrect syntax:**
1. Add to COMMON_MISTAKES with correct pattern
2. Strengthen the correct pattern in main section
3. Add decision tree if choice is ambiguous
4. Consider if naming/syntax itself is confusing (file issue)

## Best Practices

### Writing Examples

**Build complexity gradually:**

```markdown
## Basic Usage

```mlld
/var @greeting = "Hello"
/show @greeting
```

## Adding Variables

Now let's add interpolation:

```mlld
/var @name = "World"
/var @greeting = "Hello, @name!"
/show @greeting
```
```

**Show correct first, then mistakes:**

```mlld
✅ /var @result = run {echo "hello"}
❌ /var @result = @run {echo "hello"}
```

**Use inline comments for non-obvious behavior:**

```mlld
/var @arr = [1,2,3,4,5]
/show @arr[-2:]             # [4,5] - last 2 elements
/show @arr[:-1]             # [1,2,3,4] - all except last
```

**Keep examples self-contained:**
- Don't reference variables defined elsewhere
- Include necessary setup in the example
- Exception: CORE_RULES can assume earlier rules understood

### Cross-Referencing

**Make navigation explicit:**

```markdown
Full details in <CONTROL_FLOW>.
This builds on <RULE_2_VARIABLE_SYNTAX>.
See <FILE_LOADING> for glob patterns.
```

**Not:**
```markdown
As discussed elsewhere...
See other documentation...
Refer to the control flow section...
```

**Create learning paths for common flows:**
- Variables → Templates → Commands → Patterns
- File loading → Globs → AST selectors
- Basic /when → /exe...when → Complex patterns

### Maintaining Consistency

**Terminology standards:**
- "directive" not "command" for `/show`, `/var`, etc.
- "command" for shell commands in `run {}`
- "executable" for `/exe` definitions
- "template" for backticks/double-colon/triple-colon
- "module" not "library" or "package"

**Variable naming in examples:**
- Realistic: `@userName`, `@items`, `@config`
- Not: `@foo`, `@bar`, `@test`, `@x` (unless showing iteration)
- Arrays: plural (`@items`, `@users`, `@files`)
- Objects: singular (`@user`, `@config`, `@response`)

**Code block language tags:**
- Always use ```mlld for mlld code
- Use ```bash for shell examples
- Use ```json for config examples
- Use ```yaml for frontmatter examples

**Comment style:**
- `>>` for start-of-line explanatory comments
- `<<` or `>>` at end of line for inline notes
- `# Output:` for showing command output
- Don't overuse - prefer self-explanatory code

## Structure Benefits

Why pseudo-XML + markdown works for LLMs:

- **LLM navigation** - Can jump to specific sections via tags (`<COMMANDS>`, `<SYNTAX>`)
- **Scannable examples** - Markdown code blocks with syntax highlighting
- **Clear boundaries** - Tags mark semantic sections without verbose XML
- **Minimal overhead** - No CDATA, no attributes, no deep nesting
- **Grep-friendly** - Maintainers can quickly find sections
- **No conflicts** - Detection rule prevents mlld file syntax from triggering XML parsing
- **Progressive disclosure** - TOC shows structure, LLMs can dive into needed sections only

This hybrid provides optimal comprehension while preserving clarity of markdown examples.

## Testing Changes

**Before committing llms.txt updates:**

1. **Validate syntax:**
   ```bash
   # Test all code examples parse correctly
   npm run ast -- '/var @test = "hello"'
   npm run ast -- path/to/temp-test.mld
   ```

2. **Test with LLM queries:**
   - Copy relevant section
   - Ask LLM: "Write an example showing X"
   - Verify output matches expected syntax
   - Test edge cases and common variations

3. **Check for conflicts:**
   ```bash
   # Search for duplicate guidance
   grep -n "run sh" llms.txt
   grep -n "/when" llms.txt

   # Look for contradictory advice
   grep -A5 -B5 "pattern" llms.txt
   ```

4. **Verify all examples:**
   - Create temp directory: `tmp/llmstxt-test/`
   - Extract multi-line examples
   - Run: `mlld run temp-script.mld`
   - Check output matches expectations

5. **Keep TOC in sync:**
   - Verify all top-level `<SECTION>` tags listed in TOC
   - Update descriptions if section purpose changed
   - Check line numbers/references are approximate but reasonable

6. **Cross-references work:**
   - Search for all `<SECTION_NAME>` references
   - Verify target sections exist
   - Ensure no typos in tag names

## Gotchas

**Avoid these common issues when updating llms.txt:**

- **Nested function examples requiring too much context** - Keep examples self-contained
- **Using deprecated syntax** - Check current grammar before adding examples
- **Tag name collisions** - Don't use tags that could be valid mlld file refs (no `<file.txt>` style tags)
- **Inconsistent terminology** - Stick to established terms (directive, executable, template, etc.)
- **Over-explaining obvious code** - Let examples speak for themselves
- **Forgetting to update version** - Bump `<MLLD_GUIDE version="">` for significant changes
- **Breaking change without marking** - Add note if syntax changed incompatibly
- **Adding features before they ship** - Only document released features
- **Copying examples without testing** - Always validate code runs
- **Cross-referencing with wrong tag names** - Double-check section exists

## Current Improvement Opportunities

Actionable suggestions for enhancing llms.txt:

### High Priority

1. **Add "First 5 Minutes" quick reference** - Absolute minimum to write working mlld:
   ```markdown
   <QUICK_START>
   Essential syntax to get started:
   - Variables: /var @name = "value"
   - Output: /show @name
   - Commands: /run cmd {echo "hello"}
   - Templates: `Hello @name`
   - Files: <README.md>
   </QUICK_START>
   ```

2. **Add more common mistakes** from recent patterns:
   - `<MISTAKE_WHEN_WITHOUT_ARROW>` - Using `/when @cond show` instead of `/when @cond => show`
   - `<MISTAKE_FOREACH_VS_FOR>` - Confusion between `foreach` (transform) and `/for` (execute)
   - `<MISTAKE_VAR_IN_COMMAND_POSITION>` - Using `/@var` instead of in value position

3. **Improve cross-referencing** - Add more "See <SECTION>" pointers:
   - CORE_RULES → detailed sections
   - SYNTAX → PATTERNS for usage examples
   - COMMANDS → CONTROL_FLOW for decision logic

### Medium Priority

4. **Standardize example realism** - Some use real-world names, others generic:
   - Audit all examples for `@foo`, `@x`, `@test`
   - Replace with realistic: `@userName`, `@config`, `@items`
   - Exception: iteration variables (`@x`, `@n`) are fine

5. **Add TOC priority indicators:**
   ```markdown
   <TOC>
   🔥 <CORE_RULES> ............... Essential fundamentals
   🔥 <SYNTAX> ................... Common syntax patterns
   ⚡ <COMMANDS> .................. Directive reference
   ⚡ <CONTROL_FLOW> .............. Decisions and iteration
   📚 <MODULES> ................... Advanced modularity
   ```

6. **Consolidate decision trees** - Standardize format across all "X vs Y" sections:
   ```markdown
   Decision tree:
   * Condition 1 → Use X
   * Condition 2 → Use Y
   * Condition 3 → Use Z
   ```

### Low Priority

7. **Add output annotations** - More examples showing expected output:
   ```mlld
   /show `2 + 2 = @{run js {return 2+2}}`
   # Output: 2 + 2 = 4
   ```

8. **Create visual separators** for long sections - Help LLMs parse boundaries in dense content

9. **Performance notes** where relevant - When to use foreach vs /for, parallel patterns, etc.

10. **Link to test cases** - Reference specific test files for complex examples:
    ```markdown
    See tests/cases/valid/feat/foreach/ for comprehensive examples.
    ```

## Related Documentation

- **docs/dev/DOCS.md** - General documentation principles
- **docs/dev/USERDOCS.md** - User-facing documentation guide
- **docs/user/** - Detailed user documentation (reference from llms.txt for exhaustive coverage)
- **tests/cases/valid/feat/** - Comprehensive test cases demonstrating features
