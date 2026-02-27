# Anti-Slop Guide

**Slop** = code an AI agent writes that a human familiar with the codebase wouldn't.

This guide defines the patterns, shows what they look like in this codebase, and states the correction. If you're an AI agent working on mlld, internalize these. If you're reviewing AI-generated code, use this as a checklist.

---

## 1. Defensive Coding That Can't Fire

### 1a. Runtime type checks on typed parameters

The parameter is already typed. TypeScript enforces this at compile time. The check is dead code.

```typescript
// BAD: pattern is already string from the method signature
private formatCustomDate(date: Date, pattern: string): string | null {
  if (typeof pattern !== 'string' || pattern.trim().length === 0) {
    return null;
  }
  // ...
}

// GOOD: trust the type system
private formatCustomDate(date: Date, pattern: string): string | null {
  if (!pattern.trim()) return null;
  // ...
}
```

Real codebase examples:
- `interpreter/eval/directive-inputs.ts` — `addIdentifier(identifier: unknown)` accepts `unknown` but every caller passes `node.identifier` from a `VariableReferenceNode` which types it as `string`. Fix: change the parameter type to `string`.
- `interpreter/eval/exec-invocation.ts:190` — `typeof paramName === 'string'` check on a value from `string[]`.

**Correction:** Trust the type system. Only add runtime type checks at system boundaries (user input, external APIs, JSON parsing). Internal function calls between typed code don't need them.

### 1b. Null fallbacks on guaranteed-initialized values

```typescript
// BAD: configs is always set by setPolicyContext
configs: (existing as any).configs ?? {},
activePolicies: (existing as any).activePolicies ?? [],

// BAD: 9 separate || [] fallbacks on the same config object
for (const cfg of this.config.concat || []) { ... }
for (const cfg of this.config.collect || []) { ... }
// ... 7 more times
```

**Correction:** Normalize once at initialization. If you set defaults in the constructor, don't re-default at every use site. If you find yourself writing `?? []` or `|| {}` on the same field in multiple places, the field should be non-optional.

### 1c. Checking what you just checked

```typescript
// BAD: both branches do the same thing
if (position && options.filePath) {
  if ('line' in position) {
    position.filePath = options.filePath;  // same assignment
  } else {
    position.filePath = options.filePath;  // same assignment
  }
}

// GOOD
if (position && options.filePath) {
  position.filePath = options.filePath;
}
```

**Correction:** If you find yourself writing `if/else` branches with identical bodies, delete the branch.

---

## 2. Type System Misuse

### 2a. Treating typed AST nodes as `unknown`

This is the single most common AI slop pattern in this codebase. The AST has defined types in `core/types/`. Using `unknown` and runtime duck-typing is wrong.

```typescript
// BAD: runtime duck-typing on known AST structure
const candidate = node as Record<string, unknown>;
if (candidate.type === 'Text' && typeof candidate.content === 'string') {
  return candidate.content;
}
if (candidate.type === 'VariableReference' && typeof candidate.identifier === 'string') {
  return `@${candidate.identifier}`;
}

// GOOD: use the actual types
import type { TextNode, VariableReferenceNode } from '@core/types';

function serializeNode(node: MlldNode): string {
  switch (node.type) {
    case 'Text': return node.content;
    case 'VariableReference': return `@${node.identifier}`;
    // ...
  }
}
```

Real codebase examples:
- `interpreter/eval/when-expression.ts:207-230` — `normalizeActionValue` casts to `Record<string, unknown>` then checks `.type` and `.wrapperType` manually.
- `cli/mcp/BuiltinTools.ts:402-503` — Duplicates `DirectiveNode` shape-checking instead of importing from `core/types`.
- `interpreter/env/Environment.ts:984-1023` — Policy context treated as `Record<string, unknown>` despite having a known shape. Fix: define a `PolicyContext` interface.
- `cli/commands/analyze.ts:599-726` — Local duck-typing of AST nodes instead of importing types.

**Correction:** Import and use the existing types. If a function receives AST nodes, type them as AST nodes. If a type doesn't exist for a known shape, create it. Never use `as Record<string, unknown>` on data whose structure you control.

### 2b. `as any` escape hatches

```typescript
// BAD
const objectSource = commandRefWithObject.objectSource as any;
if (objectSource?.type === 'ExecInvocation') { ... }

// GOOD: narrow with a type guard or union type
function isExecInvocation(node: unknown): node is ExecInvocation {
  return !!node && typeof node === 'object' && (node as any).type === 'ExecInvocation';
}
```

**Correction:** If you need `as any`, it usually means you need a type guard, a union type, or a properly typed interface. `as any` should be rare and always have a comment explaining why.

---

## 3. Duplication

### 3a. Copy-pasting utilities across files

```typescript
// BAD: identical function in 15 files
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
```

This exact function exists in 15 separate files in this codebase. There's already an exported version in `interpreter/eval/var/tool-scope.ts` that nobody imports.

Similarly, `error instanceof Error ? error.message : String(error)` appears in 64 places across 39 files.

**Correction:** Before writing a utility function, search the codebase. If it exists, import it. If it exists but isn't exported, export it. If it doesn't exist and you need it in 2+ places, create it in a shared location and import it everywhere. For this codebase, shared utilities belong in `core/utils/`.

### 3b. Near-identical functions in parallel files

```typescript
// BAD: output.ts and append.ts both define their own copy
function isObjectPlaceholderPath(targetPath: string): boolean { ... }
function normalizeOutputTargetPath(...): string { ... }  // output.ts
function normalizeAppendTargetPath(...): string { ... }  // append.ts — nearly identical
```

**Correction:** If two files need the same validation, extract it to a shared module. Don't copy-paste and rename.

---

## 4. Comments

### 4a. Restating the code

```typescript
// BAD: every comment says what the next line does
// Set the current file path if provided (for error reporting)
if (options.filePath) { env.setCurrentFilePath(options.filePath); }

// Set stdin content if provided
if (options.stdinContent !== undefined) { env.setStdinContent(options.stdinContent); }

// Set import approval bypass if provided
if (options.approveAllImports) { env.setApproveAllImports(options.approveAllImports); }
```

A human reads `if (options.filePath) { env.setCurrentFilePath(options.filePath); }` and immediately understands it. The comment adds nothing.

**Correction:** Only comment *why*, never *what*. If the code needs a comment to explain what it does, the code should be clearer, not more commented. Good comment: `// Force exit — some runtime handles leak after async cleanup`. Bad comment: `// Exit the process`.

### 4b. Section headers inside functions

```typescript
// BAD: the function needs decomposition, not headings
function processOrder(order: Order) {
  // --- Validate ---
  if (!order.id) throw ...;

  // --- Calculate ---
  const total = order.items.reduce(...);

  // --- Save ---
  await db.save(order);
}
```

**Correction:** If you're writing section comments, extract those sections into functions. The function names become the documentation.

---

## 5. Unnecessary Abstraction

### 5a. One-use helper functions

```typescript
// BAD: called from exactly one place, 5 lines away
function normalizeToolCallError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
// ... 1300 lines later, called once:
error: normalizeToolCallError(error)

// GOOD: inline it
error: error instanceof Error ? error.message : String(error)
```

Real codebase examples:
- `interpreter/eval/exec-invocation.ts:198` — `normalizeToolCallError`, called once.
- `interpreter/eval/directive-inputs.ts:487,544` — `addIdentifier` and `addVariableByIdentifier`, each called from 2 adjacent `case` branches in the same switch. Inlining is clearer.

**Correction:** Don't extract a function unless it's called from 3+ places, or unless the extraction genuinely makes the calling code easier to understand. A 1-line function called once is just indirection.

### 5b. Speculative generality

```typescript
// BAD: options for use cases that don't exist
function formatDate(date: Date, options?: {
  locale?: string;
  timezone?: string;
  format?: 'short' | 'long' | 'custom';
  customFormat?: string;
  calendar?: string;
  hourCycle?: '12' | '24';
}): string

// GOOD: build what you need now
function formatDate(date: Date, format: string): string
```

**Correction:** Build for the current use case. When a second use case arrives, generalize then. Don't pre-build extension points, plugin architectures, or option objects for hypothetical futures.

---

## 6. Error Handling

### 6a. Catch-and-rethrow with no added context

```typescript
// BAD: catches, wraps message, loses original stack
catch (error) {
  throw new Error(`Failed to read '${path}': ${error instanceof Error ? error.message : String(error)}`);
}

// GOOD: use cause to preserve the chain
catch (error) {
  throw new Error(`Failed to read '${path}'`, { cause: error });
}

// ALSO GOOD: just don't catch it if you're not adding value
// Let it propagate — the caller will have the context they need.
```

### 6b. Bare rethrow

```typescript
// BAD: this try/catch does nothing
try {
  await criticalOperation();
} catch (error) {
  throw error;
}

// GOOD: delete the try/catch entirely
await criticalOperation();
```

Real codebase example: `interpreter/eval/data-values/CollectionEvaluator.ts:333-335`.

### 6c. Silent swallowing

```typescript
// BAD: errors vanish
catch (error) {
  // intentionally empty
}

// BAD: errors become console noise with no recovery
catch (error) {
  console.log('error occurred');
}
```

**Correction:** Either handle the error meaningfully (recover, transform, report), or don't catch it. Catch blocks should justify their existence.

---

## 7. Testing

### 7a. Assertions that don't assert

```typescript
// BAD: tells you nothing if it fails
expect(result).toBeDefined();
expect(result).not.toBeNull();

// GOOD: assert the actual value
expect(result).toBe('expected-output');
expect(result).toEqual({ id: 1, status: 'active' });
```

### 7b. Testing the mock, not the code

```typescript
// BAD: verifies plumbing, not behavior
expect(mockDB.findUser).toHaveBeenCalledWith('123');

// GOOD: verify the output
const user = await service.getUser('123');
expect(user.name).toBe('Alice');
```

### 7c. Testing impossible states

```typescript
// BAD: tests a condition the type system prevents
it('handles null input', () => {
  // @ts-ignore - forcing null into a non-nullable parameter
  expect(() => process(null)).toThrow();
});
```

**Correction:** Test behavior, not implementation. Assert outputs, not call sequences. Don't test conditions that the type system or framework already prevents.

---

## 8. Over-Handling Data Shapes

When you know the shape of your data, handle that shape. Don't write code that handles 5 possible shapes "just in case."

```typescript
// BAD: handles strings, arrays, objects with __commands,
// objects with cmd.type === 'list', objects with cmd.type === 'map',
// objects with cmd.list — when the AST only produces one of these
function addCommandNeedsFromValue(value: unknown): void {
  if (typeof value === 'string') { addCommandNeed(value); return; }
  if (Array.isArray(value)) { for (const e of value) addCommandNeed(e); return; }
  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.__commands)) { ... }
  const cmdValue = record.cmd;
  if (cmdRecord.type === 'list' && Array.isArray(cmdRecord.items)) { ... }
  if (cmdRecord.type === 'map' && cmdRecord.entries) { ... }
  if (Array.isArray(cmdRecord.list)) { ... }
}

// GOOD: handle the actual AST shape
function extractCommandNeeds(needsNode: NeedsDirectiveValues): string[] {
  return needsNode.cmd?.items ?? [];
}
```

**Correction:** If you're writing more than 2 `if (typeof x ===` checks in a function, you probably don't understand the data shape. Read the type definitions or the code that produces the data. Handle what actually arrives, not what might theoretically arrive.

---

## Summary Checklist

When reviewing AI-generated code, check for:

1. **Runtime type checks on typed parameters** — delete them
2. **`as Record<string, unknown>` on AST nodes** — use actual types
3. **Copy-pasted utility functions** — search, import, share
4. **Comments restating the next line** — delete them
5. **`?? []` / `|| {}` on always-initialized fields** — normalize once at init
6. **One-use extracted functions** — inline them
7. **catch-and-rethrow with no added context** — remove the try/catch or use `{ cause }`
8. **`as any` without a justifying comment** — fix the types
9. **Tests that assert `.toBeDefined()`** — assert the actual value
10. **Functions handling 5 data shapes when 1 is possible** — read the types, handle reality
