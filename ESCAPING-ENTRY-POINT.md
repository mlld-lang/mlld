# mlld Escaping Implementation - Entry Point

**Note**: This is on the `escape` branch. The `task.md` file in this directory is from a different effort (ESLint cleanup) and can be ignored.

## Overview

We are implementing a comprehensive escaping system for mlld to fix security vulnerabilities and provide proper escape sequence support. The codebase has already been refactored to work purely with the AST (no string manipulation), which simplifies our implementation.

## Key Documents

1. **Architecture Reference**: `docs/dev/ESCAPING.md`
   - Describes the 4-layer escaping architecture
   - Covers both mlld syntax escaping and shell command safety
   - Includes examples and security considerations

2. **Implementation Plan**: `ESCAPE-IMPLEMENTATION-PLAN-POST-REFACTOR.md`
   - 4-day implementation plan (AST refactoring already complete)
   - Phase 1: Grammar Enhancement
   - Phase 2: Shell Escaping Integration
   - Phase 3: Fix Specific Bugs
   - Phase 4: Testing & Documentation

## Current Status

### ✅ Completed
- AST-only refactoring (no more string manipulation)
- Parameter nodes implemented for exec/text directives
- All `.raw` field usage eliminated from interpreter

### 🚧 In Progress
- Planning and architecture design complete
- Ready to start implementation

### 📋 TODO
1. **Grammar Enhancement** - Add string escape sequences (`\n`, `\t`, etc.)
2. **Shell Security** - Integrate `shell-quote` library, ban dangerous operators
3. **Bug Fixes** - Fix `\@` not preventing interpolation (#168), fix C-style escapes (#167)
4. **Testing** - Comprehensive security and regression tests

## Key Design Decisions

1. **Shell Operators**: Ban all operators except pipes (`|`)
   - `&&`, `||`, `;`, `>`, `>>` will be parse errors
   - Users should use mlld's control flow instead

2. **Escape Sequences**:
   - mlld syntax: `\@`, `\[`, `\]`, `\\`
   - String escapes: `\n`, `\t`, `\r`, `\"`, `\'`, `\0`
   - All processed in grammar, not post-parse

3. **Security First**: Use `shell-quote` library for proper shell escaping

## Implementation Strategy

Since we have no existing users yet:
- Make breaking changes for security
- No legacy compatibility needed
- Clean, secure implementation from day one

## GitHub Issues Context

- **#174**: Original 4-layer architecture proposal
- **#171**: Shell escaping security vulnerability (HIGH PRIORITY)
- **#172**: No mechanism for newlines/control characters
- **#173**: Context confusion in nested escaping
- **#167**: Backslash processes C-style escapes incorrectly
- **#168**: `\@` doesn't prevent variable interpolation

## Quick Start

1. Read `docs/dev/ESCAPING.md` for architecture understanding
2. Review `ESCAPE-IMPLEMENTATION-PLAN-POST-REFACTOR.md` for tasks
3. Start with Phase 1: Grammar Enhancement
4. Focus on security (issue #171) as highest priority

## Key Files to Modify

1. `grammar/base/segments.peggy` - Add escape sequences
2. `grammar/patterns/shell-command.peggy` - Integrate for parsing
3. `interpreter/eval/run.ts` - Add shell-quote integration
4. `interpreter/core/interpolation.ts` - Respect escape sequences