@import[services/StateService/*.ts]

Please list all public methods found in this code. For each method, summarize its signature and note if it appears in IStateService.

@import[tests/services/StateService/*.test.ts]

Please identify any usage of clone(), createChildState(), or transformation methods in these tests. Summarize how they are tested.


Please list all public methods found in this code.

For each method, summarize its signature and note if it appears in IStateService


mmeld _meld/audit/detailed/1-*.meld.md && mmeld _meld/audit/detailed/2-*.meld.md && mmeld _meld/audit/detailed/3-*.meld.md

oneshot _meld/audit/detailed/1-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/detailed/1-answer.md && oneshot _meld/audit/detailed/2-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/detailed/2-answer.md && oneshot _meld/audit/detailed/3-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/detailed/3-answer.md

mmeld _meld/audit/solutions/1-*.meld.md && mmeld _meld/audit/solutions/2-*.meld.md && mmeld _meld/audit/solutions/3-*.meld.md && oneshot _meld/audit/solutions/1-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/solutions/1-answer.md && oneshot _meld/audit/solutions/2-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/solutions/2-answer.md && oneshot _meld/audit/solutions/3-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/solutions/3-answer.md


oneshot _meld/audit/1-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/1-answer.md

oneshot _meld/audit/2-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/2-answer.md && oneshot _meld/audit/3-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/3-answer.md && oneshot _meld/audit/4-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/4-answer.md && oneshot _meld/audit/5-*.md --model o1 --effort high --system _meld/audit/partials/auditor.md -o _meld/audit/5-answer.md && 

# `mmeld` and `oneshot` Usage Guide

This is a guide for using the 0.1 prototype version of meld's prompt scripting language combined with the tool `oneshot` in order to send prompts to advanced reasoning AI models.

## Quick Reference

```bash
# Basic command chain template:
mmeld audit.meld.md && oneshot audit.md --model o1 --effort high --system "You are a meticulous code auditor performing a systematic analysis of the codebase. You focus on concrete evidence, always citing specific code with line numbers and file paths. You never make assumptions or hallucinate code that isn't shown. You structure your findings using clear headers, markdown tables, and bullet points. When analyzing issues, you trace through the full context including interfaces, implementations, tests, and usage patterns. You are particularly attentive to state management, error handling, and test coverage." -o audit-results.md

# Common meld directives:
@cmd[cpai ../../src ../../tests --stdout]  # Include contents relative to meld file
@cmd[npm test]                             # Commands run from project root
@import[../README.md]                      # Imports relative to meld file
```

**Critical Notes:**
- You MUST wait for oneshot response to complete - do not interrupt!
- Place all meld scripts in `_meld` folder at project root
- Path handling is critical - see "Critical Path Handling Notes" section below
- When running tests in prompts, use `;` instead of `&&` to handle stderr

## Critical Path Handling Notes

1. Meld Directive Paths (`@cmd`, `@import`):
   - ALL paths in meld directives are relative to the meld file location
   - Example: if your meld file is in `_meld/audit/script.meld.md`:
     ```markdown
     @cmd[cpai ../../services/StateService --stdout]  # Goes up two levels from _meld/audit/
     @import[../partials/header.md]                  # Goes up one level to _meld/
     ```

2. Command Execution Paths:
   - Commands like `npm test` run from the project root
   - Example in `_meld/audit/script.meld.md`:
     ```markdown
     @cmd[npm test tests/api/api.test.ts]  # Path is relative to project root
     ```

3. Output File Handling:
   - `mmeld script.meld.md` outputs to `script.md` in the same directory
   - The oneshot `-o` argument specifies where to save the analysis results
   - Example:
     ```bash
     # If your meld file is _meld/audit/interface.meld.md:
     mmeld _meld/audit/interface.meld.md  # Creates _meld/audit/interface.md
     oneshot _meld/audit/interface.md -o audit-interface-results.md
     ```

## What are Mmeld and Oneshot?

`mmeld` is a prototype tool for creating prompts with programmatically assembled context. It processes `.meld.md` files into `.md` files using special directives.

`oneshot` is a tool for sending prompts to high-reasoning LLM models for analysis.

## System Prompt Examples

Different analysis tasks require different expert personas. Here are some examples:

1. Code Auditor:
```
You are a meticulous code auditor performing a systematic analysis of the codebase. You focus on concrete evidence, always citing specific code with line numbers and file paths. You never make assumptions or hallucinate code that isn't shown. You structure your findings using clear headers, markdown tables, and bullet points. When analyzing issues, you trace through the full context including interfaces, implementations, tests, and usage patterns. You are particularly attentive to state management, error handling, and test coverage.
```

2. Architecture Review:
```
You are an expert in building reliable and maintainable DSL systems, particularly in structuring state interpreters. You are passionate about SOLID architecture, taking methodical approaches, and making incremental and testable changes. You focus on identifying architectural patterns, potential coupling issues, and opportunities for improving system modularity.
```

3. Test Analysis:
```
You are an expert in test analysis and debugging. You methodically trace through test failures, examining both the test code and the implementation being tested. You always include specific error messages, stack traces, and relevant code snippets in your analysis. You look for patterns across multiple test failures and identify root causes rather than symptoms.
```

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

1. Basic workflow:
   ```bash
   # Define the system prompt once
   AUDIT_PROMPT="You are a meticulous code auditor performing a systematic analysis of the codebase. You focus on concrete evidence, always citing specific code with line numbers and file paths. You never make assumptions or hallucinate code that isn't shown. You structure your findings using clear headers, markdown tables, and bullet points. When analyzing issues, you trace through the full context including interfaces, implementations, tests, and usage patterns. You are particularly attentive to state management, error handling, and test coverage."

   # Create and analyze a single audit:
   mmeld _meld/audit/interface.meld.md && \
   oneshot _meld/audit/interface.md \
     --model o1 \
     --effort high \
     --system "$AUDIT_PROMPT" \
     -o audit-results/interface-audit.md

   # Run multiple audits in parallel:
   mkdir -p audit-results
   for i in {1..5}; do
     script="_meld/audit/$i-*.meld.md"
     base=$(basename "$script" .meld.md)
     (
       mmeld "$script" && \
       oneshot "_meld/audit/$base.md" \
         --model o1 \
         --effort high \
         --system "$AUDIT_PROMPT" \
         -o "audit-results/$base-results.md"
     ) &
   done
   wait
   ```

2. For one-off queries:
   - Create a new .meld.md file with a descriptive name
   - Use consistent naming for input and output files
   - Consider using subdirectories to organize related analyses

3. When including test runs:
   - Use `;` instead of `&&` to handle stderr
   - Consider redirecting test output if very verbose