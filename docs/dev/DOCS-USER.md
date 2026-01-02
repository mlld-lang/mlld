---
updated: 2025-01-27
tags: #docs, #style, #user-docs
related-docs: docs/dev/DOCS.md, docs/dev/DOCS-DEV.md, docs/*.md
---

# User Documentation Guide

## tldr

Write user-facing docs that show, don't tell. Start with working examples, build complexity gradually, respect readers' time. Every concept needs runnable code.

## Principles

- **Show, don't tell**: Focus on examples over explanations
- **Example-first**: Working code within first 3 lines
- **Be terse**: Simple pointers beat exhaustive explanations  
- **Respect cognitive load**: Add nothing that isn't critical
- **Present tense only**: No "this used to..." or future promises
- **No marketing**: Skip self-congratulation and buzzwords
- **Progressive disclosure**: Simple → Common → Advanced → Edge cases
- **Ensure accurate syntax**: Every example must be runnable

## Structure

### Document Organization

Use inverted pyramid - most important information first:

```md
# Feature Name

## tldr
One paragraph or one working example that covers 80% of use cases.

## Basic Usage
Simplest possible working example.

## Common Patterns
2-3 frequent use cases with examples.

## Advanced Usage (optional)
Complex scenarios, performance tips.

## Reference (optional)
Complete option lists, API details.
```

### Writing Examples

**Start simple, build gradually:**

```md
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

## Using Templates

For more complex formatting:

```mlld
/var @user = {"name": "Alice", "role": "Admin"}
/show ::Welcome {{user.name}}! Role: {{user.role}}::
```
```

**Always show output:**

```md
```mlld
/var @result = /run {echo "Hello"} | @upper
/show @result
```

Output:
```
HELLO
```
```

## Voice and Tone

- **Active voice**: "You can use" not "It can be used"
- **Direct address**: "You" and "we" instead of passive constructions
- **Acknowledge complexity**: "This is tricky because..." when appropriate
- **Celebrate progress**: "Great! You just learned how to..."
- **No apologies**: Don't say "simply" or "just" - if it were simple, they wouldn't need docs

## Cross-References

Make navigation explicit:

- "If you're looking for X, see [doc]"
- "This builds on concepts from [doc]"  
- "Common mistake: trying X instead of Y"
- "For more examples, see patterns.md"

Not: "As discussed elsewhere..." or "See other documentation"

## Examples Requirements

- Every concept must have a runnable example
- Include expected output for examples
- Mark examples requiring external setup with prerequisites
- Test all examples before committing
- Use realistic scenarios, not `foo/bar`

## Progressive Disclosure

Separate "need to know" from "nice to know":

```md
## Basic File Loading

```mlld
/var @content = <README.md>
/show @content
```

<details>
<summary>Advanced: Loading with metadata</summary>

You can also access file metadata:

```mlld
/var @file = <package.json>
/show @file.tokens        # Token count
/show @file.fm.title      # Frontmatter
```

</details>
```

## Common Patterns to Avoid

❌ **Don't explain what they can see:**
```md
The following example shows how to define a variable:
```

✅ **Just show it:**
```md
Define variables with /var:
```

❌ **Don't use foo/bar:**
```md
/var @foo = "bar"
```

✅ **Use realistic examples:**
```md
/var @userName = "Alice"
```

❌ **Don't assume context:**
```md
As we saw earlier, variables can be interpolated.
```

✅ **Be self-contained:**
```md
Variables can be interpolated with @:
```

## Checklist

Before committing user docs:

- [ ] Working example in first 3 lines
- [ ] All code examples tested
- [ ] Expected output shown
- [ ] No forward/backward references in time
- [ ] No marketing language
- [ ] Clear cross-references
- [ ] Progressive complexity
- [ ] Realistic example data
