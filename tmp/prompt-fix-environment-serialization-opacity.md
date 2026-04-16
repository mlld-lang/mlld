# Fix: Environment is never serialized (m-0ea4)

## What's broken

Any value-to-string coercion path in mlld that encounters a value transitively referencing an Environment object enters unbounded V8 `JsonStringify` recursion. This causes multi-minute stalls, 1-2GB+ RSS, and eventual OOM or process hangs.

Three confirmed manifestations, all the same root cause:

1. **Test files**: `@stateSummary | @pretty` OOMs on state summaries carrying record/exe refs.
2. **`mlld live --stdio`**: audit stream serializes tool entries with 179-206KB payloads each; bench canary stalls.
3. **`mlld --new`**: flow file execution hangs with child process hot in `Builtin_JsonStringify`.

All three funnel through the same common value-to-string coercion path. The fix is one check in one place.

## The invariant to land

**Environment is never serialized.**

1. The common value-to-string coercion path must recognize Environment references by type tag and stop walking. Emit a stable placeholder (`"[Environment]"`) and do not recurse into the subtree.
2. Detection is a type-tag check on the runtime's Environment class (or whatever the constructor name is). Not a heuristic on property names or shape.

Because exe values, tool collections, record references, and all other runtime-laden types transitively reference Environment, stopping at Environment bounds the walk for ALL of them automatically. One check, one place, all three manifestations fixed.

## Where to implement

### Step 1: Find the common serialization entry point

All three manifestations go through value-to-string coercion before hitting `JSON.stringify`. Find the common path that converts an mlld value to a string for:

- Pipeline transformer input (what `| @pretty`, `| @json` receive)
- `show` directive output
- Template interpolation (`"text @value text"`)
- Audit log event serialization
- Trace event serialization

This is likely a single function or a small set of functions that all call `JSON.stringify` (or a custom serializer) on the value's data. The check goes at the TOP of that path, before any recursive walk.

```bash
# Find the serialization entry points:
grep -rn 'JSON\.stringify' interpreter/ --include='*.ts' | grep -v test | grep -v node_modules
```

### Step 2: Add the Environment type-tag check

At the entry point (or in a `replacer` function passed to `JSON.stringify`), add:

```typescript
function safeReplacer(key: string, value: unknown): unknown {
  if (value && typeof value === 'object') {
    const ctor = (value as any).constructor?.name;
    if (ctor === 'Environment') {
      return '[Environment]';
    }
    // Also catch any other known runtime-only classes if needed:
    // if (ctor === 'Interpreter' || ctor === 'Evaluator') return '[Environment]';
  }
  return value;
}
```

Use this replacer wherever the common serialization path calls `JSON.stringify`. If the path uses a custom serializer instead of `JSON.stringify`, add the equivalent check in the custom walker.

**Important:** the constructor name `Environment` is the actual class name used in mlld's interpreter. Verify by checking:

```bash
grep -rn 'class Environment' interpreter/ core/ --include='*.ts' | head -5
```

Use whatever the actual class name is.

## Test fixture

Create `tests/cases/serialization/environment-opacity/`:

### `example.mld`:

```mlld
exe @search(query) = js { return []; }

record @contact = {
  facts: [email: string],
  data: [name: string?]
}

var tools @catalog = {
  search: {
    mlld: @search,
    returns: @contact,
    labels: ["resolve:r"],
    description: "Search contacts."
  }
}

>> These must all complete without OOM/hang:
show @catalog
show @catalog | @json
show @catalog | @pretty
show `catalog: @catalog`

>> Verify the placeholder appears for Environment refs:
>> (exact output depends on where Environment surfaces in the structure)
show "done"
```

### `expected.md`:

The exact output of `show @catalog` will depend on how the tool collection serializes, but the key assertions are:

- All four `show` lines complete (no hang, no OOM).
- `show "done"` is reached.
- The output contains `[Environment]` placeholder(s) where Environment refs were stopped.
- The output does NOT contain the full recursive dump of Environment internals.

## Verification

```bash
npm run build
npx vitest run
npm run test:case -- serialization/environment-opacity

# Then the three previously-blocked paths:
# 1. Test file:
cd ~/mlld/clean && mlld --new rig/tests/index.mld
# 2. Flow file:
cd ~/mlld/clean && mlld --new rig/tests/flows/derive.mld
# 3. Live stdio (bench canary):
cd ~/mlld/clean && mlld --new bench/tests/workspace-tools.mld
```

All three must complete without OOM or multi-minute stalls.

## What NOT to do

- Do NOT add per-type `toJSON` methods on wrapper classes. That's scattered and unmaintainable. One replacer in one place is the fix.
- Do NOT add the check only in the audit path or only in the `| @pretty` path. The check goes in the COMMON coercion path so every consumer is covered.
- Do NOT try to serialize a "summary" of Environment. Just emit the placeholder. Summary/compact serialization of complex runtime objects is a separate concern (and may not be needed after this fix shrinks payloads to reasonable sizes).
- Do NOT add cycle detection as part of this fix. Cycle detection is a separate concern (documented as non-scope in m-0ea4). The Environment check bounds the walk; cycles that don't transit through Environment are a different bug.
- Do NOT remove the `@safeStringify` workaround in `clean/rig/tests/index.mld` as part of this fix. That's a downstream cleanup the framework team does after verifying the fix works. They'll revert `@safeStringify` → `| @pretty` as their verification step.

## After the fix

Once this lands, the downstream framework team will:

1. Verify `mlld --new rig/tests/flows/derive.mld` completes.
2. Verify `mlld live --stdio` bench canary completes.
3. Revert the `@safeStringify` workaround in `clean/rig/tests/index.mld` back to `| @pretty` and verify the test suite still passes.
4. Resume the defended bench sweep.

If audit payloads are still impractically large after the fix (bounded but still 20-50KB per entry because exe AST bodies are big), that's a separate follow-on concern — not this ticket.
