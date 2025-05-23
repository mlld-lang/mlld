# Meld Interpreter Rewrite Plan

## Overview

After struggling with over-engineered service orchestration, we're moving to a traditional interpreter pattern. This is a proven approach used by Python, Ruby, JavaScript, and most scripting languages.

## Current Problem

The existing architecture tries to separate concerns that are naturally coupled:
- Handlers that process but don't resolve
- ResolutionService that resolves but doesn't understand directives
- Complex back-and-forth between services
- Chicken-and-egg problems with variable resolution

## Proposed Solution

A clean, traditional interpreter with:
- Single recursive `evaluate()` function
- Environment that carries state + capabilities
- No service orchestration
- Clear data flow: AST → Evaluate → Environment → Output

## Architecture Design

```typescript
// Core pattern
function evaluate(node: MeldNode, env: Environment): EvalResult {
  switch (node.type) {
    case 'Directive': return evaluateDirective(node, env);
    case 'Text': return { value: node.content, env };
    case 'VariableReference': return { value: env.getVariable(node.name), env };
  }
}

// Environment holds everything
class Environment {
  variables: Map<string, any>
  parent?: Environment  // for scoping
  
  // Capabilities
  readFile(path: string): string
  executeCommand(cmd: string): string
  resolvePath(path: string): string
}
```

## Implementation Plan

### Phase 1: Core Interpreter (Day 1) ✅ COMPLETED
- [x] Create `interpreter/` directory structure
- [x] Implement Environment class with:
  - Variable storage/retrieval
  - Parent scope chain
  - Capability methods (file, command, path)
- [x] Implement core `evaluate()` function
- [x] Implement `evaluateDirective()` with all directive types
  - [x] Basic implementation for all directives
  - [x] Port basic logic from existing handlers
  - [ ] Full feature parity with old handlers

### Phase 2: Integration (Day 2) ✅ COMPLETED
- [x] Create `interpret()` entry point function
- [x] Wire up to existing parser
- [x] Connect to output formatters (basic markdown/xml)
- [ ] Update DI container to use new interpreter

### Phase 3: Testing (Day 3-4) 🚧 IN PROGRESS
- [x] Create test harness for new interpreter
- [x] Fixture-based testing using existing fixtures
- [ ] Ensure all AST fixtures pass (Currently 6/40 = 15%)
- [ ] Performance benchmarking

### Phase 4: Migration (Day 5) 📋 TODO
- [ ] Switch CLI to use new interpreter
- [ ] Update API to use new interpreter
- [ ] Document migration
- [ ] Remove old services

## Directory Structure

```
meld/
├── interpreter/
│   ├── README.md
│   ├── core/
│   │   ├── interpreter.ts    # Main evaluate() function
│   │   ├── types.ts          # Core types
│   │   └── interpolate.ts    # String interpolation helper
│   ├── env/
│   │   └── Environment.ts    # Environment implementation
│   ├── eval/
│   │   ├── directive.ts      # evaluateDirective()
│   │   ├── text.ts           # Text directive evaluation (from TextDirectiveHandler)
│   │   ├── data.ts           # Data directive evaluation (from DataDirectiveHandler)
│   │   ├── run.ts            # Run/exec evaluation (from Run/ExecDirectiveHandler)
│   │   ├── import.ts         # Import evaluation (from ImportDirectiveHandler)
│   │   ├── path.ts           # Path evaluation (from PathDirectiveHandler)
│   │   └── add.ts            # Add directive evaluation (from AddDirectiveHandler)
│   └── output/
│       ├── formatter.ts      # Output formatting interface
│       └── markdown.ts       # Markdown formatter
```

## What We Keep

- Parser and AST types (excellent already)
- Output formatting logic
- CLI interface
- All test fixtures
- Error types and handling patterns
- **Directive logic from handlers** (just reorganized)

## What We Replace

| Current | New | Why |
|---------|-----|-----|
| InterpreterService | `evaluate()` function | Simpler recursion |
| DirectiveService + Handlers | `evaluateDirective()` switch | Less indirection |
| StateService | Environment class | Unified state+capabilities |
| ResolutionService | `interpolate()` helper | Just string interpolation |
| All interfaces/adapters | Gone | No orchestration needed |

## Handler Logic Mapping

Example of how we'll port handler logic:

### Current (TextDirectiveHandler)
```typescript
async handle(directive, state, options) {
  const identifier = directive.raw?.identifier;
  const contentNodes = directive.values?.content;
  const resolvedValue = await this.resolution.resolve({...});
  const variable = createTextVariable(identifier, finalValue);
  return { stateChanges: { variables: {[identifier]: variable} } };
}
```

### New (text.ts evaluator)
```typescript
export async function evaluateText(directive: DirectiveNode, env: Environment) {
  const identifier = directive.raw?.identifier;
  const contentNodes = directive.values?.content;
  const resolvedValue = await interpolate(contentNodes, env);
  env.setVariable(identifier, createTextVariable(identifier, resolvedValue));
  return { value: resolvedValue, env };
}
```

Key differences:
- No service injection needed
- Direct environment manipulation
- Same core logic, simpler flow

## Success Criteria

1. All existing tests pass
2. Simpler code (fewer files, less indirection)
3. Better performance (benchmark before/after)
4. Easier to debug (stack traces show evaluation path)
5. Easier to extend (adding directives is just adding cases)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Keep all test fixtures |
| Performance regression | Benchmark throughout |
| Missing edge cases | Incremental development with tests |

## Decision Points

1. **Async vs Sync**: Keep async for file/command operations
2. **Error handling**: Use existing MeldError types
3. **Variable types**: Keep existing type system (text, data, path, etc.)
4. **Output formats**: Reuse existing formatters

## Current Status (Implementation Day 1)

### ✅ What's Working
1. **Core Architecture** - Clean interpreter pattern with Environment
2. **Basic Directives**:
   - `@text` - Variable definition with interpolation
   - `@data` - Simple data storage (not dotted notation)
   - `@path` - Path resolution with special variables
   - `@run` - Command execution
   - `@add` - Templates and simple variables (not field access)
   - `@import` - Basic file imports with variable merging
   - `@exec` - Command/code definition (not callable functions)

### ❌ What's Not Working (GitHub Issues Filed)
1. **Field Access** (#42) - `@colors[0]`, `@object.property`
2. **Section Extraction** (#43) - `@add [file.md # Section]`
3. **Multiline Templates** (#45) - Parser issue with `@add [[...]]`
4. **Dotted Data Notation** (#47) - `@data greeting.text = "Hello"`
5. **Callable Functions** (#48) - `@exec` defining functions for `@run @func()`

### 📊 Test Results
- **Total Fixtures**: 40
- **Passing**: 6 (15%)
- **Core functionality works** but edge cases need implementation

### 🔄 Key Architecture Decisions Made
1. **Parser returns array** - We handle both single nodes and arrays
2. **Newlines are nodes** - Preserved as content for markdown output
3. **Direct execution** - Handlers execute commands/read files directly (no ResolutionService indirection)
4. **Fixture-based testing** - Using real examples, skipping numbered partial fixtures
5. **Incremental approach** - Get core working, file issues for edge cases

## Timeline

- **Day 1**: ✅ Core interpreter implementation
- **Day 2**: ✅ Integration with parser/output
- **Day 3-4**: 🚧 Testing and refinement (15% complete)
- **Day 5**: 📋 Migration and cleanup
- **Total**: 5 days to clean, maintainable solution

## Next Steps

1. ~~Review and approve this plan~~
2. ~~Create interpreter directory structure~~
3. ~~Start with Environment implementation~~
4. ~~Build evaluate() function incrementally~~
5. ~~Test each directive type as we go~~
6. **CURRENT**: Improve directive implementations for better coverage
7. **NEXT**: Migrate CLI/API to use new interpreter