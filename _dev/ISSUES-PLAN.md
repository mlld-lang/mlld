# Critical Issues Implementation Plan

**Based on investigation findings from GitHub issues #56-72**

## 🎯 Strategic Overview

This plan addresses the critical bugs discovered during investigation that prevent mlld from being production-ready. The approach prioritizes **error handling** and **real-world functionality** over feature completeness.

## 📋 Issue Categories & Priority

### **Phase 1: Foundation - Error Handling (Week 1)**
**Priority: CRITICAL** - Unblocks debugging and user experience

- **#72**: Complex examples produce empty output without error messages
- **#62**: Import directive fails silently, producing empty output instead of error  
- **Parse errors**: Currently create empty output instead of helpful messages

### **Phase 2: Import System (Week 2)**
**Priority: HIGH** - Essential for real-world usage

- **#63**: Import path resolution uses wrong base path
- **#62**: Import variables not available after `@import { * }`
- **#69**: Test infrastructure masks import path issues

### **Phase 3: Core Interpreter Bugs (Week 3)**
**Priority: MEDIUM-HIGH** - Affects feature functionality

- **#71**: Parameterized exec commands fail with shell syntax error
- **#66**: Variable interpolation happens too early in shell commands

### **Phase 4: Testing Infrastructure (Week 4)**
**Priority: MEDIUM** - Prevents regressions

- **#69**: Tests use MemoryFileSystem which masks real-world path resolution issues

### **Phase 5: Grammar & Polish (Week 5+)**
**Priority: LOW-MEDIUM** - Feature enhancements

- **#56**: Grammar: Support template invocations with parameters in data values
- **#57**: Grammar: Support exec references in data values  
- **#58**: Grammar: Support null values in data objects
- **#67**: Array indexing in templates shows entire array instead of indexed element
- **#59**: Template values in data objects are not evaluated when accessed

## 🚨 Error Handling System Implementation

### Current Error Test Infrastructure

Our error testing system is already in place but needs activation:

```
tests/cases/
├── invalid/          # Syntax errors (parser failures)
│   ├── text/missing-bracket/
│   │   ├── example.md      # @text foo = [[bar (missing ]])
│   │   └── error.md        # Expected closing template delimiter "]]"
│   └── [other categories]/
├── exceptions/       # Runtime errors
│   ├── commands/
│   └── imports/
└── warnings/         # Non-fatal issues
    └── deprecated/
```

**Test Pattern:**
- `example.md` - Contains invalid mlld syntax
- `error.md` - Contains expected error message
- `setup.ts` (optional) - Environment setup for test

### Error Categories Implementation

#### **1. Invalid Syntax (`tests/cases/invalid/`)**
For parser-level errors that should fail during AST generation:

```typescript
// Current: Silent failure with empty output
// Target: Clear parse error with location info
```

**Examples to add:**
- `invalid/exec/invalid-template/` - `@exec cmd = [[template]]` (should be `@run`)
- `invalid/variables/nested-variable-ref/` - `{{users.@index.name}}` (not implemented, ref: #73)
- `invalid/directives/unknown/` - `@unknown directive`

#### **2. Runtime Exceptions (`tests/cases/exceptions/`)**
For interpreter-level errors during evaluation:

```typescript
// Current: Empty output 
// Target: Detailed error with import chain context
```

**Examples to add:**
- `exceptions/imports/file-not-found/` - Import resolution failures (#63)
- `exceptions/imports/variable-not-found/` - Import variable merging failures (#62)
- `exceptions/exec/command-not-found/` - Exec parameter resolution (#71)
- `exceptions/variables/interpolation-failure/` - Variable timing issues (#66)

#### **3. Training Wheels Warnings (`tests/cases/warnings/`)**
For `--check` mode - valid syntax but potentially unintended:

```typescript
// Mode: Warning shown but processing continues
// CLI: `mlld --check file.mld` or default behavior
```

**Examples to add:**
- `warnings/variables/inline-variable-ref/` - `Hello @name` in plain text (#68)
- `warnings/directives/mid-line-directive/` - `Text @run [cmd] more text`
- `warnings/performance/large-file/` - File operations on large files
- `warnings/not-implemented/nested-variables/` - `@var.@other.field` with link to #73

#### **4. Deprecated Syntax (`tests/cases/deprecated/`)**
For future syntax changes (empty initially):

```typescript
// Future: When we change syntax patterns
```

### Error Message Standards

#### **Parse Errors (Invalid)**
```
Error in file.mld:5:23

  4 | @text name = "World"
  5 | @text greeting = [[username
                               ^
  6 | @text message = "Hello!"

ParseError: Expected closing template delimiter "]]" after template content.
```

#### **Runtime Errors (Exceptions)**
```
Error in lib/config.mld:10:5

  10 | @text value = [[missingVar]]
                       ^^^^^^^^^^^

VariableResolutionError: Variable 'missingVar' is not defined

This error occurred while importing:
  main.mld:2:1
    @import { * } from "./lib/config.mld"

Did you mean 'myVar'?
```

#### **Not Implemented Errors**
```
Error in complex.mld:15:12

  15 | @text result = [[users.@index.name]]
                             ^^^^^^

NotImplementedError: Nested variable references like '@index' inside field access are not yet supported.

See: https://github.com/mlld-lang/mlld/issues/73

Workaround: Use a temporary variable:
  @data currentIndex = @index
  @text result = [[users.{{currentIndex}}.name]]
```

#### **Training Wheels Warnings**
```
Warning in casual.mld:8:15

  8 | Hello @name, how are you?
             ^^^^^

InlineVariableWarning: Variable reference '@name' in plain text won't be interpolated.

Use a template instead:
  @text greeting = [[Hello {{name}}, how are you?]]
  @add @greeting
```

## 🔧 Implementation Phases

### **Phase 1: Error Infrastructure (Week 1)**

#### **1.1 CLI Error Propagation (Day 1-2)**
**Target Issues: #72, #62**

```typescript
// Current: Empty output on error
// Target: Proper error display and exit codes

// cli/index.ts changes:
try {
  const result = await interpret(content, options);
  await writeOutput(result);
} catch (error) {
  if (error instanceof MlldError) {
    console.error(formatError(error));
    process.exit(1);
  }
  throw error; // Re-throw unexpected errors
}
```

#### **1.2 Parse Error Handling (Day 3-4)**
**Target Issue: #72**

```typescript
// grammar/parser integration:
// Current: Throws generic parse errors
// Target: MlldParseError with location context

// Add to interpreter entry point:
try {
  const parseResult = await parse(content);
} catch (parseError) {
  throw new MlldParseError(
    parseError.message,
    {
      location: parseError.location,
      file: options.filename,
      suggestion: generateSuggestion(parseError)
    }
  );
}
```

#### **1.3 Error Test Infrastructure (Day 5)**

```typescript
// tests/utils/ast-fixtures.js enhancement:
// Detect error.md files and generate error fixtures
// Support setup.ts for test environment configuration

// interpreter.fixture.test.ts enhancement:
if (fixture.expectedError) {
  await expect(async () => {
    await interpret(fixture.input, options);
  }).rejects.toThrow(MlldError);
  
  // Verify error message matches expected output
}
```

### **Phase 2: Import System Fixes (Week 2)**

#### **2.1 Import Path Resolution (#63)**
**Root Cause: CLI basePath setup**

```typescript
// Investigation found: Import resolves relative to wrong directory
// Fix: Ensure basePath is set to importing file's directory

// CLI integration:
const options = {
  basePath: path.dirname(inputFile), // Not process.cwd()
  fileSystem,
  pathService
};
```

#### **2.2 Import Variable Merging (#62)**
**Root Cause: Variables not properly transferred to parent environment**

```typescript
// interpreter/eval/import.ts investigation needed:
// Variables imported but not available in parent scope

// Add debug logging to understand variable transfer:
console.log('Child variables:', childEnv.getAllVariables());
console.log('Parent variables after import:', env.getAllVariables());
```

#### **2.3 Import Error Test Cases**

Add comprehensive import error scenarios:
- `exceptions/imports/path-resolution/` - Cross-directory import failures
- `exceptions/imports/circular-imports/` - Circular dependency detection
- `exceptions/imports/variable-not-found/` - Missing imported variables

### **Phase 3: Interpreter Bug Fixes (Week 3)**

#### **3.1 Exec Parameter Handling (#71)**
**Root Cause: Text assignments with `@run` not evaluated as directives**

```typescript
// interpreter/eval/text.ts fix needed:
// Current: Treats '@run @cmd(params)' as literal text
// Target: Evaluate as directive reference

if (directive.meta?.directive === 'run' && directive.meta?.run?.isCommandRef) {
  // Evaluate as exec command invocation
  return await evaluateExecReference(directive, env);
}
```

#### **3.2 Variable Interpolation Timing (#66)**
**Root Cause: Variables not interpolated before shell execution**

```typescript
// interpreter/eval/run.ts fix needed:
// Current: Shell receives template syntax
// Target: Interpolate variables first

// Before shell execution:
const interpolatedCommand = await interpolateContent(command, env);
const result = await env.execute(interpolatedCommand);
```

### **Phase 4: Test Infrastructure Overhaul (Week 4)**

#### **4.1 Realistic Directory Testing (#69)**

```typescript
// tests/utils/MemoryFileSystem.ts enhancement:
// Support realistic directory structures

// Create test scenarios:
const testStructure = {
  '/project/main.mld': '@import { * } from "./lib/utils.mld"',
  '/project/lib/utils.mld': '@text helper = "utility"',
  '/project/lib/config.mld': '@data settings = { env: "test" }'
};

// Test from different working directories
```

#### **4.2 Integration Test Suite**

Add end-to-end tests that mirror real usage:
- Cross-directory imports
- Complex project structures  
- CLI invocation from different directories
- Path resolution edge cases

### **Phase 5: Training Wheels & Polish (Week 5+)**

#### **5.1 `--check` Mode Implementation**

```typescript
// CLI option for training wheels mode:
mlld --check file.mld  // Show warnings but don't write output
mlld file.mld          // Process with warnings (default)
mlld --no-warnings file.mld  // Suppress warnings

// Implementation:
interface InterpreterOptions {
  checkMode?: boolean;        // Only validate, don't output
  showWarnings?: boolean;     // Display warnings (default: true)
  warningLevel?: 'strict' | 'normal' | 'permissive';
}
```

#### **5.2 Warning Categories**

```typescript
// Core warning types:
class InlineVariableWarning extends MlldWarning {
  // @name in plain text that won't interpolate
}

class MidLineDirectiveWarning extends MlldWarning {
  // @directive not at start of line
}

class NotImplementedWarning extends MlldWarning {
  // Features not yet supported with workarounds
  constructor(feature: string, issueUrl: string, workaround: string) {
    // Link to GitHub issue + suggested alternative
  }
}
```

## 🧪 Test Strategy

### **Error Test Execution Flow**

1. **ast-fixtures.js** scans for `error.md`/`warning.md` files
2. Generates fixtures with `expectedError`/`expectedWarnings` fields
3. **interpreter.fixture.test.ts** validates error messages match exactly
4. Error messages become part of the specification

### **Test Categories**

```
tests/cases/
├── invalid/           # Parser errors - should fail fast
├── exceptions/        # Runtime errors - should show context
├── warnings/          # Training wheels - should guide users
└── deprecated/        # Future syntax changes
```

### **Validation Criteria**

- **Error messages are helpful**: Include location, context, and suggestions
- **Error handling is consistent**: Same pattern across all error types
- **Errors are tested**: Every error path has a test case
- **Performance is maintained**: Error handling adds minimal overhead

## 📈 Success Metrics

### **Phase 1 Success (Error Handling)**
- [ ] No more empty output files on errors
- [ ] Parse errors show line/column information  
- [ ] Import errors display full context
- [ ] All current examples either work or show clear errors

### **Phase 2 Success (Import System)**
- [ ] Cross-directory imports work correctly
- [ ] `examples/demo.mld` executes successfully
- [ ] Import variables are available in parent scope
- [ ] Import path resolution is predictable

### **Phase 3 Success (Interpreter Fixes)**
- [ ] Parameterized exec commands execute properly
- [ ] Variable interpolation in shell commands works
- [ ] Complex examples from issues #72 work with correct syntax

### **Phase 4 Success (Testing)**
- [ ] Tests catch real-world path resolution issues
- [ ] Integration tests validate cross-directory scenarios
- [ ] Test infrastructure mirrors actual usage patterns

### **Overall Success Criteria**
- [ ] `examples/` directory works completely
- [ ] Users get helpful error messages instead of empty output
- [ ] Import system supports realistic project structures
- [ ] New users get guidance through training wheels warnings

## 🔗 Related Issues

**High Priority:**
- [#72](https://github.com/mlld-lang/mlld/issues/72) - Complex examples produce empty output without error messages
- [#71](https://github.com/mlld-lang/mlld/issues/71) - Parameterized exec commands fail with shell syntax error  
- [#69](https://github.com/mlld-lang/mlld/issues/69) - Tests use MemoryFileSystem which masks real-world path resolution issues
- [#66](https://github.com/mlld-lang/mlld/issues/66) - Variable interpolation happens too early in shell commands
- [#63](https://github.com/mlld-lang/mlld/issues/63) - Import path resolution uses wrong base path
- [#62](https://github.com/mlld-lang/mlld/issues/62) - Import directive fails silently, producing empty output instead of error

**Medium Priority:**
- [#68](https://github.com/mlld-lang/mlld/issues/68) - Inline variable references don't work in plain text
- [#67](https://github.com/mlld-lang/mlld/issues/67) - Array indexing in templates shows entire array instead of indexed element
- [#65](https://github.com/mlld-lang/mlld/issues/65) - Shell glob patterns don't expand in @run commands
- [#64](https://github.com/mlld-lang/mlld/issues/64) - Comment nodes are included in output instead of being ignored

**Future Features:**
- [#73](https://github.com/mlld-lang/mlld/issues/73) - Support for nested variable references
- [#56-58](https://github.com/mlld-lang/mlld/issues/56) - Grammar enhancements for data values

## 🎯 Next Actions

**Week 1 Immediate Steps:**
1. Implement CLI error propagation (2-3 hours)
2. Add parse error handling with location info (4-6 hours)  
3. Test error infrastructure with existing `invalid/` cases (2-3 hours)
4. Validate that `examples/demo.mld` shows helpful errors (1 hour)

**Success Checkpoint:**
After Week 1, users should get clear error messages instead of empty output files, enabling productive debugging of all subsequent issues.