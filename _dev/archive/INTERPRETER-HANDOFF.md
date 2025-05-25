# Interpreter Rewrite Handoff Document

## Current Status: Traditional Interpreter Implementation (Day 1 Complete)

We've successfully built a clean, traditional interpreter for Meld to replace the over-engineered service architecture. This document captures all key decisions and current state for continuation.

## What We Built

### Architecture
- **Traditional interpreter pattern** - Single recursive `evaluate()` function
- **Environment class** - Holds state and provides capabilities (no service injection)
- **Direct evaluation** - Handlers execute commands and read files directly
- **No ResolutionService** - Just simple interpolation helpers

### Key Files
```
interpreter/
├── core/
│   ├── interpreter.ts    # Main evaluate() function
│   └── types.ts         # Core types
├── env/
│   └── Environment.ts   # State + capabilities
├── eval/
│   ├── directive.ts     # Router to specific evaluators
│   ├── text.ts         # @text evaluation
│   ├── data.ts         # @data evaluation
│   ├── run.ts          # @run evaluation
│   ├── exec.ts         # @exec evaluation
│   ├── add.ts          # @add evaluation
│   ├── path.ts         # @path evaluation
│   └── import.ts       # @import evaluation
└── output/
    └── formatter.ts     # Basic markdown/xml formatting
```

## Critical Decisions Made

### 1. Parser Returns Arrays
The parser returns an array of nodes, not a single root node. We handle this in `evaluate()`:
```typescript
if (Array.isArray(node)) {
  // Process each node
}
```

### 2. Newlines Are Nodes
Newlines are preserved as nodes because Meld operates within markdown files where whitespace matters. We handle `Newline` nodes by returning empty string.

### 3. Direct Execution
Handlers execute commands and read files directly instead of delegating to services. This aligns with "AST Knows All" - handlers are smart.

### 4. Fixture Testing Strategy
- Using existing fixtures from `core/ast/fixtures/`
- **Skip numbered fixtures** (e.g., `add-variable-1.fixture.json`) - they're partial
- Only test complete fixtures

### 5. Incremental Approach
Get core functionality working, file GitHub issues for edge cases rather than blocking progress.

## Current Test Results

**6/40 fixtures passing (15%)** - But this includes many edge cases

### ✅ What Works
- Basic variable definition and interpolation
- Simple @add templates and variables
- Command execution (@run)
- Text assignment
- Basic imports

### ❌ Known Issues (GitHub Issues Filed)
- **#42**: Field access (`@colors[0]`) - Parser limitation, LOW PRIORITY
- **#43**: Section extraction (`[file.md # Section]`)
- **#45**: Multiline templates - Parser issue
- **#47**: Dotted data notation (`@data config.name = "value"`)
- **#48**: Callable exec functions (`@run @func()`)

## Next Steps for Implementation

### Priority 1: Section Extraction
- We have `lib/llmxml` as a git submodule
- Should use `llmxml.getSection()` for section extraction
- Currently using basic regex implementation (see TODO in `add.ts`)

### Priority 2: Path Resolution
- Check if special variables ($HOMEPATH, $PROJECTPATH) work correctly
- May need to port more logic from old PathDirectiveHandler

### Priority 3: Import Improvements
- Verify variable merging works correctly
- Test nested imports

### Low Priority: Field Access
- This is a parser limitation where `@colors[0]` becomes two nodes
- We attempted a fix but it needs the AST to properly parse field access
- Not worth blocking on this

## How to Continue

### Running Tests
```bash
# Run interpreter tests with fixtures
npm test interpreter/interpreter.fixture.test.ts

# Run specific test
npm test interpreter/interpreter.fixture.test.ts -t "add-path"
```

### Adding Test Files
Some fixtures expect files to exist. We added this pattern:
```typescript
if (fixture.name === 'add-path') {
  await fileSystem.writeFile('/file.md', 'content...');
}
```

### Debugging AST Issues
```bash
# Check how something is parsed
npm run ast -- '@add @colors[0]'
```

## Architecture Philosophy

### "AST Knows All"
- Intelligence in AST types via discriminated unions
- Handlers are smart and do the work
- Services just provide capabilities
- No orchestration layers

### Why We Moved Away from Services
The service architecture created artificial boundaries:
- Handlers that process but don't resolve
- ResolutionService that resolves but doesn't understand directives
- Circular dependency issues
- Over-engineering for a simple interpreter

### The Right Approach
- Handlers extract values from AST and do all the work
- Environment provides capabilities (file reading, command execution)
- Simple recursive evaluation
- Direct manipulation of state

## Important Context

### Meld is Weird (But in a Good Way)
- It's a prompt scripting language embedded in markdown
- Everything is content (including newlines)
- Uses `@var` syntax outside templates, `{{var}}` inside templates
- Can import markdown sections as modules

### Grammar Limitations
Some issues are grammar-related and documented in:
- `_dev/GRAMMAR-BUGS.md`
- `_dev/GRAMMAR-TYPE-UPDATES.md`

### Don't Get Stuck
If something seems like a grammar issue or edge case:
1. File a GitHub issue
2. Move on
3. Focus on getting core functionality working

## Final Notes

The interpreter is architecturally sound and ready for incremental improvements. The clean design makes it easy to add missing functionality. Focus on impact - features that will get more fixtures passing.

**Remember**: We're aiming for 65% functionality, not perfection. The core is solid, and edge cases can be fixed as needed.
