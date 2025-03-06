# `meld` and `oneshot` Usage Guide

This is a guide for using the 0.1 prototype version of meld's prompt scripting language combined with the tool `oneshot` in order to send prompts to advanced reasoning AI models.

CLAUDE: pay VERY CLOSE attention to the critical notes  below or this will fail.

## Quick Reference

```bash
# Basic command chain template:
rm prompt.md ; meld prompt.meld.md ; oneshot prompt.md --model o1 --effort high --system <role> -o prompt-answer.md

# Common meld directives:
@cmd[cpai src tests --stdout]  # Include contents of src and test folders
@cmd[npm test]                 # Include test results
@import[../README.md]          # Import content from a markdown file
```

**Critical Notes:**
- You MUST wait for oneshot response to complete - do not interrupt!
- Place all meld scripts in `_meld` folder at project root
- All paths in meld directives are relative to the meld file location *BUT* the `-o filename` is relative to the path you're executing oneshot from.
- When running tests in prompts, use `;` instead of `&&` to handle stderr

## What are Meld and Oneshot?

`meld` is a tool for creating prompts with programmatically assembled context. It processes `.meld.md` files into `.md` files using special directives.

`oneshot` is a tool for sending prompts to high-reasoning LLM models for analysis.

## Meld Directives

Two main directives are available:

1. `@cmd[...]` - Runs any shell command and includes output
2. `@import[...]` - Embeds content from any markdown document 

Important path note: All paths are relative to the meld file. For example, if your meld file is in `_meld/prompt.meld.md`:
- To include project src: `@cmd[cpai ../src --stdout]`
- To import project README: `@import[../README.md]`

## Oneshot Models and Usage

Two primary models are available:

1. `o1`
   - Exceptionally smart but slow
   - Good with huge context
   - Best for analytical thinking, advanced planning, test failure analysis, and advanced code review

2. `o3-mini`
   - Much faster while maintaining high reasoning
   - Best for quick second opinions and simple code reviews

Both models should be run with `--effort high`

## Best Practices for Prompt Writing

### Structure
Use these sections (some optional):
1. Intro
2. Docs
3. Code
4. Test results
5. Task

### Formatting
- Use clear headers to break up sections
- Be explicit about task requirements
- End with clear directives for response quality

### Example Prompt Template

```markdown
=== CODE AND TESTS ===

@cmd[cpai src tests --stdout]

==== END CODE AND TESTS ===

=== TEST STATUS ===

@cmd[npm test]

=== END TEST STATUS ===

YOUR TASK:

[Clear description of what you need analyzed]

DO NOT GUESS. DO NOT GIVE HAND-WAVY ADVICE. BE EVIDENCE-BASED, EXPLICIT, AND DECISIVE.
```

### Follow-up Prompts
When making follow-up queries:
- Include relevant parts of prior answers/analysis as context
- Keep the same base structure
- Maintain clear task descriptions

## Command Chain Best Practices

1. Always use the complete chain to:
   - Remove prior built files
   - Build new meld file
   - Send to oneshot
   - Save output

2. For one-off queries:
   - Use `prompt.meld.md` as filename
   - Reuse the same file for different queries

3. When including test runs:
   - Use `;` instead of `&&` to handle stderr
   - Same for file deletion operations

Complete command chain example:
```bash
rm prompt.md ; meld prompt.meld.md ; oneshot prompt.md --model o1 --effort high --system <role> -o prompt-answer.md
```