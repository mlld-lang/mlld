# Simple mlld Stacktrace - Implementation Plan

## Overview
Implement a minimal directive trace that shows the execution path when errors occur. This provides immediate debugging value with minimal code changes.

## Goal
Transform incomprehensible JavaScript stack traces into clear mlld execution paths:

```
Error in this chain:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@import ........................................................... config.mld:3
└── @text greeting ................................................ config.mld:8
    └── @data items ............................................... main.mld:15
        └── @foreach processItem .................................. main.mld:16
            └── @run .............................................. lib.mld:25
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Implementation Details

### 1. Data Structure (~10 lines)

**File**: `core/types/trace.ts` (new)
```typescript
export interface DirectiveTrace {
  directive: string;      // '@text', '@data', etc.
  varName?: string;       // Variable or exec name
  location: string;       // 'file.mld:line'
  depth: number;          // Nesting level
}
```

### 2. Environment Changes (~30 lines)

**File**: `interpreter/env/Environment.ts`

Add to class:
```typescript
private directiveTrace: DirectiveTrace[] = [];
private traceEnabled: boolean;

constructor(...) {
  // Add to existing constructor
  this.traceEnabled = config?.enableTrace !== false; // Default on
}

pushDirective(
  directive: string, 
  varName?: string,
  location?: SourceLocation
): void {
  if (!this.traceEnabled) return;
  
  this.directiveTrace.push({
    directive,
    varName,
    location: location ? `${location.file}:${location.line}` : 'unknown',
    depth: this.directiveTrace.length
  });
}

popDirective(): void {
  if (!this.traceEnabled) return;
  this.directiveTrace.pop();
}

getDirectiveTrace(): DirectiveTrace[] {
  return [...this.directiveTrace];
}
```

### 3. Trace Formatter (~50 lines)

**File**: `core/utils/DirectiveTraceFormatter.ts` (new)

```typescript
export class DirectiveTraceFormatter {
  private readonly LINE_WIDTH = 80;
  
  // ANSI color codes
  private readonly colors = {
    dim: '\x1b[90m',       // gray for dots/lines
    directive: '\x1b[36m',  // cyan for @directives  
    variable: '\x1b[33m',   // yellow for variable names
    file: '\x1b[90m',       // gray for files
    reset: '\x1b[0m'
  };

  format(trace: DirectiveTrace[], useColors = true): string {
    if (trace.length === 0) return '';
    
    const c = useColors ? this.colors : {
      dim: '', directive: '', variable: '', file: '', reset: ''
    };
    
    const lines: string[] = [];
    
    // Header
    lines.push('Error in this chain:');
    lines.push(c.dim + '━'.repeat(this.LINE_WIDTH) + c.reset);
    
    // Format each entry
    trace.forEach((entry, i) => {
      const indent = '    '.repeat(entry.depth);
      const prefix = i === 0 ? '' : '└── ';
      
      // Build colored parts
      const directive = c.directive + entry.directive + c.reset;
      const variable = entry.varName ? 
        ' ' + c.variable + entry.varName + c.reset : '';
      const location = c.file + entry.location + c.reset;
      
      // Calculate dots needed
      const leftPart = indent + prefix + directive + variable + ' ';
      const rightPart = ' ' + location;
      
      // Strip ANSI codes for length calculation
      const leftLength = this.stripAnsi(leftPart).length;
      const rightLength = this.stripAnsi(rightPart).length;
      
      const dotsNeeded = this.LINE_WIDTH - leftLength - rightLength;
      const dots = c.dim + '.'.repeat(Math.max(dotsNeeded, 3)) + c.reset;
      
      lines.push(leftPart + dots + rightPart);
    });
    
    // Footer
    lines.push(c.dim + '━'.repeat(this.LINE_WIDTH) + c.reset);
    
    return lines.join('\n');
  }
  
  private stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }
}
```

### 4. Integration Points (~40 lines)

**File**: `interpreter/eval/directive.ts`

```typescript
import { DirectiveTrace } from '@core/types/trace';

export async function evaluateDirective(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Extract trace info based on directive type
  const traceInfo = extractTraceInfo(directive);
  
  env.pushDirective(
    traceInfo.directive,
    traceInfo.varName,
    directive.location
  );
  
  try {
    // Existing switch statement unchanged
    switch (directive.kind) {
      // ... existing cases
    }
  } finally {
    env.popDirective();
  }
}

function extractTraceInfo(directive: DirectiveNode): {
  directive: string;
  varName?: string;
} {
  const info: { directive: string; varName?: string } = {
    directive: `@${directive.kind}`
  };
  
  // Extract variable/exec names based on directive type
  switch (directive.kind) {
    case 'text':
    case 'data':
    case 'path':
      // @text varName = ...
      const identifier = directive.values?.identifier?.[0];
      if (identifier?.type === 'Text') {
        info.varName = identifier.content;
      }
      break;
      
    case 'run':
      // @run @execName or run [command]
      if (directive.subtype === 'runExec') {
        const execId = directive.values?.identifier?.[0];
        if (execId?.type === 'Text') {
          info.varName = `@${execId.content}`;
        }
      }
      break;
      
    case 'exec':
      // @exec funcName(...) = ...
      const execName = directive.values?.name?.[0];
      if (execName?.type === 'Text') {
        info.varName = execName.content;
      }
      break;
      
    case 'foreach':
      // foreach @template(@items)
      const template = directive.values?.template?.[0];
      if (template?.type === 'Text') {
        info.varName = template.content;
      }
      break;
  }
  
  return info;
}
```

### 5. Error Enhancement (~20 lines)

**File**: `core/errors/MlldError.ts`

Add to interface:
```typescript
export interface BaseErrorDetails {
  // ... existing fields
  directiveTrace?: DirectiveTrace[];
}
```

**File**: `interpreter/core/interpreter.ts`

Modify error handling:
```typescript
} catch (error) {
  // Add trace to mlld errors
  if (error instanceof MlldError) {
    error.details = {
      ...error.details,
      directiveTrace: env.getDirectiveTrace()
    };
  }
  throw error;
}
```

### 6. Error Display (~15 lines)

**File**: `core/utils/errorDisplayFormatter.ts`

Add to `formatError()` method:
```typescript
// After existing error message formatting
if (error.details?.directiveTrace && error.details.directiveTrace.length > 0) {
  const formatter = new DirectiveTraceFormatter();
  const useColors = options.colors !== false;
  const trace = formatter.format(error.details.directiveTrace, useColors);
  
  sections.push({
    type: 'trace',
    content: trace
  });
}
```

## Testing Strategy

### Unit Tests
1. Test trace capture accuracy
2. Test formatting with/without colors
3. Test variable name extraction
4. Test nesting levels

### Integration Tests  
1. Test with real error scenarios
2. Test cross-file traces
3. Test with foreach/async operations
4. Performance impact measurement

### Test Cases
```typescript
// Test trace accuracy
test('captures correct directive sequence', () => {
  const result = interpret(`
    @text greeting = "hello"
    @data items = [1, 2, 3]
    @add foreach @process(@items)
  `);
  
  // Should capture: @text greeting → @data items → @foreach process
});

// Test formatting
test('formats trace with proper alignment', () => {
  const trace = [
    { directive: '@import', location: 'config.mld:3', depth: 0 },
    { directive: '@text', varName: 'greeting', location: 'config.mld:8', depth: 1 }
  ];
  
  const formatted = formatter.format(trace, false);
  expect(formatted).toContain('@import ..... config.mld:3');
  expect(formatted).toContain('└── @text greeting ..... config.mld:8');
});
```

## Configuration

### CLI Flag
```bash
# Disable trace (on by default)
mlld --no-trace script.mld
```

### Environment Variable
```bash
MLLD_TRACE=false mlld script.mld
```

## Timeline

1. **Core Implementation** (2 hours)
   - Add trace types
   - Modify Environment
   - Create formatter

2. **Integration** (2 hours)
   - Wire into evaluateDirective
   - Add error enhancement
   - Update error display

3. **Testing** (2 hours)
   - Unit tests
   - Integration tests
   - Performance check

4. **Polish** (1 hour)
   - Documentation
   - Code cleanup
   - PR preparation

**Total: ~7 hours = 1 day**

## Future Enhancements
- Add data sampling (Phase 1)
- Add execution timing
- Add memory usage
- Cross-file navigation helpers

## Success Metrics
- Zero performance impact when disabled
- <1% overhead when enabled
- Clear execution path in all errors
- No breaking changes