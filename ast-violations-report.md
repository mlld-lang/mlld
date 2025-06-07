# AST Pattern Violations Report for mlld Interpreter

## Complete List of AST Pattern Violations in mlld Interpreter

### 1. **Direct use of `.raw` fields instead of `.values` arrays**

**Files**: `text.ts:65`, `data.ts:19`, `exec.ts:42`, `exec.ts:100`, `import.ts`, `path.ts`, `run.ts`, `add.ts`

**Violations**:
- `directive.raw?.identifier` used throughout instead of extracting from `directive.values?.identifier` array
- `directive.raw?.lang` used instead of metadata or AST structure  
- `directive.raw?.section` used instead of proper AST parsing

**Example from text.ts:65**:
```typescript
// VIOLATION: Using raw field directly
const identifier = directive.raw?.identifier;

// SHOULD BE: Extract from values array
const identifierNodes = directive.values?.identifier;
const identifier = await interpolate(identifierNodes, env);
```

### 2. **Direct access to `.content` property instead of AST evaluation**

**Files**: `data-value-parser.ts:81`, `data-value-parser.ts:88`, `data-value-parser.ts:172`, `interpreter.ts:64`, `interpreter.ts:104`

**Violations**:
- `(node as TextNode).content` used directly instead of evaluation
- Bypassing the interpolation system for simple cases

**Example from data-value-parser.ts:81**:
```typescript
// VIOLATION: Direct content extraction
if (typeof node === 'object' && node !== null && 'type' in node && node.type === 'Text') {
  return (node as TextNode).content; // Should use evaluation
}
```

### 3. **String manipulation on AST content**

**Files**: `text.ts:135`, `text.ts:204-244`, `import.ts`, `run.ts`

**Violations**:
- String operations like `.startsWith()`, `.match()`, `.replace()` on node content
- Manual parsing of command arguments using regex
- Section title manipulation with string operations

**Example from text.ts:204-244**:
```typescript
// VIOLATION: Manual argument parsing with regex
const argsMatch = contentStr.match(/@\w+\((.*?)\)/);
if (argsMatch && argsMatch[1]) {
  const argStr = argsMatch[1];
  // Simple argument parsing - split by comma and trim quotes
  const args = argStr.split(',').map(arg => {
    // ... string manipulation
  });
}
```

### 4. **Direct operator access instead of AST representation**

**Files**: `text.ts:270`, other evaluators

**Violations**:
- `directive.operator` used directly instead of AST structure

**Example from text.ts:270**:
```typescript
// VIOLATION: Direct operator access
const operator = directive.operator || '=';

// SHOULD BE: Extract from AST structure
const operatorNodes = directive.values?.operator;
const operator = operatorNodes ? await interpolate(operatorNodes, env) : '=';
```

### 5. **Manual node construction instead of proper AST**

**Files**: `text.ts:180-244`, `interpreter.ts:92-98`, `interpreter.ts:116-122`

**Violations**:
- Creating synthetic nodes manually instead of proper AST structures
- Hardcoded node properties without proper AST construction

**Example from text.ts:180-244**:
```typescript
// VIOLATION: Manual node construction
const runDirective: DirectiveNode = {
  type: 'Directive',
  nodeId: directive.nodeId + '-run',
  kind: 'run',
  subtype: 'runExec',
  source: 'exec',
  values: {
    identifier: [{ 
      type: 'Text', 
      nodeId: '', 
      content: directive.meta.run.commandName 
    }],
    // ... hardcoded properties
  },
  raw: {
    identifier: directive.meta.run.commandName,
    args: []
  },
  // ... more hardcoded properties
};
```

### 6. **Inconsistent array vs single value handling**

**Files**: `data.ts:26-29`, multiple evaluators

**Violations**:
- Manual array checks instead of type-safe patterns
- Inconsistent handling of whether `directive.values.X` is an array or single value

**Example from data.ts:26-29**:
```typescript
// VIOLATION: Manual array unwrapping
let rawValue = directive.values?.value;
if (Array.isArray(rawValue) && rawValue.length === 1) {
  rawValue = rawValue[0];
}
```

### 7. **String-based condition checking instead of AST evaluation**

**Files**: `import.ts`, `when.ts`

**Violations**:
- String comparisons for specific values instead of proper AST evaluation
- Manual parsing of condition values

**Example from import.ts**:
```typescript
// VIOLATION: String comparison on AST content
if (content === '@INPUT' || content === '@input') {
  return await evaluateInputImport(directive, env);
}
```

### 8. **Legacy grammar workarounds**

**Files**: `exec.ts:14-29`, `run.ts`, `interpreter.ts:129-141`

**Violations**:
- Manual stripping of `[` characters from command templates
- TODO comments indicating grammar bugs that should be fixed at AST level
- Parameter extraction using string manipulation

**Example from exec.ts:14-29**:
```typescript
// VIOLATION: Manual workaround for grammar issues
function extractParamNames(params: any[]): string[] {
  return params.map(p => {
    // Once fixed, this should just be: return p; (if params are strings)
    // or: return p.name; (if params are Parameter nodes)
    if (typeof p === 'string') {
      return p;
    } else if (p.type === 'VariableReference') {
      // Current workaround for grammar issue #50
      return p.identifier;
    }
    // ...
  });
}
```

### 9. **Mixed field access patterns**

**Files**: `data.ts:46`, multiple evaluators

**Violations**:
- Some code accesses node fields properly through arrays
- Other code directly accesses object properties for same operations
- Inconsistent patterns for the same type of operation

**Example from data.ts:46**:
```typescript
// VIOLATION: String manipulation on identifier instead of AST
const parts = identifier.split('.');
const varName = parts[0];
```

### 10. **Type inconsistencies between expected AST and actual usage**

**Files**: Throughout interpreter

**Violations**:
- The `DirectiveNode` interface defines `values: { [key: string]: BaseMlldNode[] }`
- But evaluators inconsistently expect both arrays and single values
- Missing proper type guards for AST node handling

## Summary

These violations indicate that the interpreter evolved with legacy patterns that don't align with the clean AST design. The main issues are:

1. **Overuse of `.raw` fields** - Should be eliminated in favor of `.values` arrays
2. **Direct content extraction** - Should use proper AST evaluation
3. **String manipulation** - Should be replaced with AST node evaluation  
4. **Manual node construction** - Should use proper AST construction functions
5. **Inconsistent type handling** - Should use type guards and consistent patterns

A systematic refactor to eliminate these patterns would significantly improve code maintainability and correctness by properly following the clean AST patterns documented in `docs/dev/AST.md`.

## Impact Assessment

### Critical Issues:
- The `.raw` field usage bypasses the AST completely, making the parser output irrelevant
- String manipulation on AST content is error-prone and defeats the purpose of having a structured AST
- Manual node construction creates maintenance nightmares when AST structure changes

### Technical Debt:
- Every evaluator file has multiple violations
- Inconsistent patterns make it hard to know the "right" way to do things
- Grammar workarounds accumulate instead of fixing root causes

### Recommendation:
A systematic refactor is needed to:
1. Eliminate all `.raw` field usage
2. Replace string manipulation with proper AST evaluation
3. Create helper functions for common AST operations
4. Fix grammar issues instead of working around them
5. Establish clear patterns and enforce them