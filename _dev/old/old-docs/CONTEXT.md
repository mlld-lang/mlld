# Creating Context Files for Meld Development

This document outlines how to create effective context files for working with Claude on different phases of the Meld project.

## What Are Context Files?

Context files are specially structured Meld documents that provide an AI assistant (like Claude) with precisely the right context needed to understand and work on a specific part of the project. They:

1. Provide focused information relevant to a specific task or phase
2. Avoid overwhelming the assistant with irrelevant information
3. Include documentation, code, and test results in a structured format
4. Give clear instructions on what needs to be accomplished

## Where to Store Context Files

- Store all context files in the `_meld` directory at the project root
- Use descriptive names like `phase1-context.meld.md` to clearly indicate purpose
- Consider creating subdirectories in `_meld` for organization if you have many context files

## Basic Structure of a Context File

```markdown
@import[partials/meld-architect.md]

# Title: Clear Description of the Phase or Task

Brief overview of what this phase/task involves and its importance in the project.

## Focus Areas

1. Key area of focus
2. Another important area

===============================
=== DOCUMENTATION SECTION ====

@import[../path/to/relevant/doc.md]

===============================
=== RELEVANT CODE ============

@cmd[cpai ../path/to/file1.ts ../path/to/file2.ts --stdout]

===============================
=== FAILING TESTS ===========

@cmd[npm test -- --no-coverage "RelevantTestPattern" | grep -B 1 -A 10 "FAIL"]

===============================
=== YOUR TASK ===============

Clear description of what needs to be accomplished.

When providing solutions:
1. Specific guidance point
2. Another guidance point

BE SPECIFIC AND DECISIVE.
```

## Key Components

### 1. Header and Overview
Start with a clear title and concise overview that summarizes:
- What phase of the project this concerns
- The current state (e.g., passing/failing tests)
- Why this work is important

### 2. Documentation Sections
Include relevant documentation using the `@import` directive:
```markdown
===============================
=== SECTION NAME =============

@import[../path/to/document.md]
```

### 3. Code Sections
For including code snippets, use the `cpai` command:
```markdown
===============================
=== RELEVANT CODE ===========

@cmd[cpai ../path/to/file1.ts ../path/to/file2.ts --stdout]
```

**Important**: Note that paths in the cpai command:
- Must include the `../` prefix to reference from the _meld directory
- Must follow the exact file structure of the project
- Must include the `--stdout` flag to display the output

### 4. Test Results
Include relevant test results:
```markdown
===============================
=== FAILING TESTS ==========

@cmd[npm test -- --no-coverage "RelevantTestPattern" | grep -B 1 -A 10 "FAIL"]
```

### 5. Task Description
Always end with a clear task description:
```markdown
===============================
=== YOUR TASK ==============

Step 1: ...
Step 2: ...
```

## Meld Directives Explained

### @import Directive
Embeds content from markdown files:
```markdown
@import[../path/to/file.md]
```

- Paths are relative to the meld file location
- Use for including documentation, plans, or previous outputs

### @cmd Directive
Runs a shell command and includes the output:
```markdown
@cmd[command to run]
```

- Use for running tests, code analysis tools, or file gathering utilities
- For complex commands, use semicolons (`;`) instead of `&&` to handle stderr

### Common Command Patterns

1. **Code gathering with cpai**:
   ```markdown
   @cmd[cpai ../path/to/file1.ts ../path/to/file2.ts --stdout]
   ```

2. **Finding failing tests**:
   ```markdown
   @cmd[npm test -- --no-coverage "ServicePattern" | grep -B 1 -A 10 "FAIL"]
   ```

3. **Test environment setup**:
   ```markdown
   @cmd[export NODE_ENV=test; npm test -- -t "specific test name"]
   ```

## Understanding the Project Structure

When including files, be aware of the nested service structure:

```
services/
├── resolution/
│   ├── ResolutionService/
│   │   ├── ResolutionService.ts
│   │   └── resolvers/
│   │       ├── PathResolver.ts
│   │       ├── VariableReferenceResolver.ts
│   │       └── ...
│   └── ValidationService/
│       └── validators/
│           ├── PathDirectiveValidator.ts
│           └── ...
├── pipeline/
│   ├── ParserService/
│   │   └── ParserService.ts
│   └── DirectiveService/
│       └── handlers/
│           └── definition/
│               ├── PathDirectiveHandler.ts
│               └── ...
└── ...
```

When referencing files, ensure you use the complete path including all subdirectories.

## Tips for Effective Context Files

1. **Be selective**: Include only files and documentation directly relevant to the current phase or task
   
2. **Group related information**: Use clear section headers to organize content logically
   
3. **Progressive disclosure**: Put the most critical information first
   
4. **Clear tasks**: End with specific, actionable tasks
   
5. **Appropriate scope**: Create separate context files for different phases rather than one massive file
   
6. **Balance**: Include enough context for understanding but not so much that it's overwhelming

7. **Verify paths**: Always check that file paths exist before finalizing your context file

## Example: Phase-Based Context Files

For each phase of development, create a focused context file:

1. **Phase 1**: Foundation issues (paths, AST, etc.)
2. **Phase 2**: Variable resolution
3. **Phase 3**: Directive validation and handling
4. **Phase 4**: API completion
5. **Phase 5**: CLI implementation

Each context file should include only what's needed for that specific phase.

## Processing and Using Context Files

After creating a context file (`your-context.meld.md`):

1. **Process the file**:
   ```bash
   meld _meld/your-context.meld.md
   ```
   
2. **Send to Claude**:
   ```bash
   oneshot _meld/your-context.md --model o1 --effort high --system architect -o your-context-output.md
   ```

3. **Review the response** in `your-context-output.md` 