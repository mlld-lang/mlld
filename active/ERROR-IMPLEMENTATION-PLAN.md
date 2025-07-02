# Error Bootstrap Implementation Plan

## Overview
Build a lightweight system for capturing and improving parser errors during development. This is bootstrap tooling to help identify and fix confusing errors, not a permanent architecture.

## Phase 1: Core Infrastructure (Day 1)
**Goal**: Get basic pattern system working

### 1. Create directory structure
```bash
mkdir -p errors/cases/parse
mkdir -p errors/captured
echo "errors/captured/" >> .gitignore
```

### 2. Define types (`core/errors/patterns/types.ts`)
```typescript
export interface ErrorPattern {
  name: string;
  test(error: PeggyError, ctx: ErrorContext): boolean;
  enhance(error: PeggyError, ctx: ErrorContext): MlldParseError;
}

export interface ErrorContext {
  line: string;
  source: string;
  location: Location;
}
```

### 3. Create pattern loader (`core/errors/patterns/loader.ts`)
```typescript
export async function loadErrorPatterns(): Promise<ErrorPattern[]> {
  const files = await glob('errors/cases/**/pattern.ts');
  const patterns = [];
  for (const file of files) {
    const module = await import(path.resolve(file));
    patterns.push(module.pattern);
  }
  return patterns;
}
```

### 4. Hook into interpreter (`interpreter/index.ts`)
- Load patterns on startup
- Replace existing error enhancement with pattern matcher
- Add fallback for unmatched errors

## Phase 2: Capture System (Day 1-2)
**Goal**: Make it easy to capture errors

### 1. Add --capture-errors flag (`cli/index.ts`)
- Detect flag in CLI args
- Pass through to interpreter options

### 2. Implement capture logic (`core/errors/capture.ts`)
```typescript
export async function captureError(error: Error, source: string, filePath: string) {
  const id = getNextCaptureId(); // 001, 002, etc.
  const dir = `errors/captured/${id}`;
  
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(`${dir}/input.mld`, source);
  await fs.writeFile(`${dir}/context.json`, JSON.stringify({
    error: error.message,
    location: error.location,
    timestamp: new Date().toISOString()
  }));
  await fs.copyFile('errors/templates/pattern.ts', `${dir}/pattern.ts`);
  
  return dir;
}
```

### 3. Create pattern template (`errors/templates/pattern.ts`)
```typescript
export const pattern = {
  name: 'TODO-name-this',
  
  test(error, ctx) {
    // TODO: Add detection logic
    // error.found === '?'
    // ctx.line.includes('?')
    return false;
  },
  
  enhance(error, ctx) {
    // TODO: Write helpful message
    return new MlldParseError(
      'TODO: Helpful error message here',
      error.location
    );
  }
};
```

## Phase 3: Test Command (Day 2)
**Goal**: Verify patterns work

### 1. Add error-test command (`cli/commands/error-test.ts`)
```typescript
export async function errorTestCommand(path: string) {
  // Load example.mld or input.mld
  const source = await findAndLoadExample(path);
  
  // Run parser and capture error
  const error = await runAndCaptureError(source);
  if (!error) {
    console.error('No error produced');
    return;
  }
  
  // Load and test pattern
  const { pattern } = await import(path.resolve(path, 'pattern.ts'));
  const ctx = createContext(error, source);
  
  if (!pattern.test(error, ctx)) {
    console.error('Pattern does not match');
    return;
  }
  
  // Show enhanced error
  const enhanced = pattern.enhance(error, ctx);
  console.log('✓ Pattern matches!');
  console.log(`Enhanced: ${enhanced.message}`);
}
```

### 2. Wire into CLI (`cli/index.ts`)
- Add 'error-test' to command list
- Route to errorTestCommand

## Phase 4: Initial Patterns (Day 2-3)
**Goal**: Fix the most annoying errors

### 1. Import wildcard pattern (`errors/cases/parse/import-wildcard/`)
- Already implemented in grammar
- Create pattern that matches and returns same message

### 2. Unknown directive pattern (`errors/cases/parse/directive-unknown/`)
```typescript
export const pattern = {
  name: 'directive-unknown',
  test: (e, ctx) => e.found === '/' && !ctx.line.match(/^\/(var|show|run|exe|import|output|when|path)/),
  enhance: (e, ctx) => {
    const attempt = ctx.line.match(/^\/(\w+)/)?.[1];
    return new MlldParseError(
      `Unknown directive '/${attempt}'. Available: /var, /show, /run, /exe, /import, /output, /when, /path`,
      e.location
    );
  }
};
```

### 3. @local resolver pattern
- Already implemented in RegistryResolver
- No parse pattern needed

## Phase 5: Integration & Testing (Day 3)
**Goal**: Make sure it all works

### 1. Manual testing
```bash
# Test capture
echo '/import { * } from "test"' | mlld --capture-errors

# Test pattern
mlld error-test errors/captured/001

# Copy and rebuild
cp -r errors/captured/001 errors/cases/parse/test-pattern
npm run build

# Verify enhancement works
echo '/import { * } from "test"' | mlld
```

### 2. Add basic documentation (`errors/README.md`)
- Quick usage guide
- Pattern examples
- Note that this is temporary

### 3. Create 5-10 patterns from actual errors encountered

## Deliverables Checklist

- [ ] Pattern loader integrated with interpreter
- [ ] --capture-errors flag working
- [ ] error-test command functional
- [ ] 5+ real error patterns created
- [ ] Basic README in errors/

## Time Estimate
- **Total**: 3 days of focused work
- **Day 1**: Core infrastructure + capture system
- **Day 2**: Test command + initial patterns
- **Day 3**: Integration, testing, documentation

## Success Criteria
1. Can capture any parse error with --capture-errors
2. Can create a pattern in <5 minutes
3. Enhanced errors show instead of Peggy spam
4. System is simple enough to use without docs

## Implementation Notes

### Pattern Loading Strategy
- Load all patterns at interpreter startup
- Store in memory for fast matching
- No hot-reloading needed (rebuild to test)

### Error Context Extraction
```typescript
function createErrorContext(error: PeggyError, source: string): ErrorContext {
  const lines = source.split('\n');
  const lineIndex = error.location.start.line - 1;
  
  return {
    line: lines[lineIndex] || '',
    source,
    location: error.location
  };
}
```

### Fallback Enhancement
```typescript
function simplifyPeggyError(error: PeggyError): MlldParseError {
  // Instead of listing 20 expectations, group them
  const hasDirectives = error.expected.some(e => e.text?.startsWith('/'));
  const message = hasDirectives 
    ? 'Expected a directive or content'
    : 'Syntax error';
    
  return new MlldParseError(message, error.location);
}
```

## Future Evolution

This bootstrap system will evolve into:
1. **Phase 1**: Pattern-based fixes (current)
2. **Phase 2**: Built-in error detection in parser
3. **Phase 3**: Comprehensive error messages throughout

The patterns we create now will inform the built-in errors later.