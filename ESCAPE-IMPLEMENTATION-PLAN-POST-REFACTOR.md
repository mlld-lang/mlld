# Escaping Implementation Plan (Post-AST-Refactor)

## Context

The codebase has been refactored to eliminate string manipulation and work purely with the AST. This significantly simplifies our escaping implementation.

## Updated Implementation Plan

### Phase 1: Grammar Enhancement (1 day)

**Goals:**
- Add string escape sequences (`\n`, `\t`, etc.) to grammar
- Integrate ShellCommandLine parser for structured command parsing
- Add parse-time validation for banned shell operators

**Tasks:**
1. Extend `EscapeSequence` in grammar to handle `\n`, `\t`, `\r`, etc.
2. Replace simple command parsing with `ShellCommandLine` parser
3. Add grammar rules to reject `&&`, `||`, `;` with clear errors
4. Update AST types if needed

### Phase 2: Shell Escaping Integration (1 day)

**Goals:**
- Integrate `shell-quote` library in command execution
- Implement secure pipeline execution
- Ensure all interpolated values are properly escaped

**Tasks:**
1. Update `run.ts` to use structured command AST from parser
2. Use `shell-quote` for building final shell commands
3. Implement pipeline execution with proper per-segment escaping
4. Ensure error messages are helpful when operators are rejected

### Phase 3: Fix Specific Escaping Bugs (1 day)

**Goals:**
- Fix `\@` not preventing interpolation (#168)
- Fix unwanted C-style escape processing (#167)
- Ensure escape sequences work in all contexts

**Tasks:**
1. Verify `\@` produces literal `@` in all contexts
2. Ensure only intended escape sequences are processed
3. Add comprehensive tests for edge cases
4. Update interpolation to respect escaping

### Phase 4: Testing & Documentation (1 day)

**Goals:**
- Comprehensive test coverage
- Updated documentation
- Migration guides if needed

**Tasks:**
1. Update test fixtures for new escaping behavior
2. Add security-focused test cases
3. Update user documentation
4. Update llms.txt with correct escaping examples

## Total Timeline: 4 days

Since string manipulation is already eliminated, we can focus purely on:
1. Enhancing the grammar
2. Integrating proper escaping libraries
3. Fixing specific bugs
4. Testing thoroughly

## Key Advantages of Post-Refactor Implementation

1. **No refactoring needed** - AST-only approach already in place
2. **Clear boundaries** - Grammar → AST → Interpolation → Execution
3. **Reduced risk** - No string manipulation patterns to break
4. **Faster implementation** - Can focus on escaping logic only

## Success Criteria

1. All escape sequences work correctly (`\n`, `\t`, `\@`, etc.)
2. Shell commands are secure against injection
3. Banned operators produce clear parse errors
4. All existing valid tests still pass
5. Performance remains unchanged

## Next Steps

1. Start with grammar enhancement
2. Run tests frequently to catch regressions
3. Focus on security in shell command execution
4. Ensure backwards compatibility for valid syntax