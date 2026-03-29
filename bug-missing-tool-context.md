# Bug: `@policy.build` returns `missing_tool_context` for imported `var tools` collections

## Problem

`@policy.build(@intent, @tools)` works when `@tools` is a local `var tools` collection declared in the same module, but it fails when the tool collection is imported from another module and the current module does not also import the underlying executable vars referenced by that collection.

Instead of compiling authorizations, the builder returns:

```json
{
  "policy": { "authorizations": { "allow": {} } },
  "valid": false,
  "issues": [
    {
      "reason": "missing_tool_context",
      "message": "Policy builder requires a valid tool collection"
    }
  ]
}
```

This causes all write authorizations to disappear even when the planner/context phase gathered correct handle-bearing control args.

## Observed benchmark symptom

After integrating `@policy.build(...)` into the AgentDojo waterfall benchmark, the specific live breaches were closed, but utility-under-attack collapsed to `0%` in the targeted reruns.

The fresh logs show:

- `debug.authorization_intent` contains the expected handle-pinned writes
- `debug.authorization_issues` contains `missing_tool_context`
- `debug.normalized_authorization` becomes `{ "allow": {} }`
- the worker then fails with `operation not authorized by policy.authorizations`

Examples:

- `results/claude-sonnet-4-20250514/waterfall/workspace/defended.atk_direct.8.jsonl`
- `results/claude-sonnet-4-20250514/waterfall/banking/defended.atk_direct.11.jsonl`

In workspace `user_task_19`, the benchmark correctly gathered:

```json
{
  "send_email": { "recipients": ["h_gm5slc"] },
  "append_to_file": { "file_id": "h_upt8mo" }
}
```

but the builder still returned `missing_tool_context`, so both writes were denied.

## Why it happens

The benchmark calls:

```mlld
var @builtAuthorization = @policy.build(@authorizationIntent, @suiteWriteToolCollection)
```

where `@suiteWriteToolCollection` is imported from another module (for example `llm/tools/workspace.mld`).

Inside `interpreter/env/builtins/policy.ts`, `resolveToolCollection(...)` currently does this for an explicit `tools` arg:

1. accepts the value if it is an object
2. calls `normalizeToolCollection(rawTools, executionEnv)`

`normalizeToolCollection(...)` then resolves every `mlld` ref by name against the **current** env:

```ts
const execVar = env.getVariable(mlldName);
if (!execVar || !isExecutableVariable(execVar)) {
  throw new Error(`Tool '${toolName}' references non-executable '@${mlldName}'`);
}
```

That is fine for a local object literal in the same module, but it breaks for imported tool collections:

- the current module imported `@writeToolCollection`
- the current module did **not** import every referenced executable like `@send_email`, `@append_to_file`, `@send_money`, etc.
- re-normalization therefore fails
- `@policy.build` collapses to `missing_tool_context`

So the underlying bug is:

**`@policy.build` cannot currently consume an already-normalized/imported `var tools` collection as a first-class value. It always re-normalizes against the current module env.**

## Minimal reproduction

Module A:

```mlld
exe exfil:send, tool:w @send_email(recipients, subject, body) = `ok` with { controlArgs: ["recipients"] }

var tools @writeTools = {
  send_email: { mlld: @send_email }
}

export { @writeTools }
```

Module B:

```mlld
import { @writeTools } from "./a.mld"

var @intent = {
  send_email: {
    recipients: "h_123abc"
  }
}

var @built = @policy.build(@intent, @writeTools)
```

Expected:

- the imported tool collection is accepted
- the builder validates `send_email` using the imported collection's metadata

Actual:

- builder reports `missing_tool_context`

If Module B also imports `@send_email`, the problem may disappear, which is another sign that the builder is incorrectly depending on the caller's current env instead of the provided tool collection.

## Expected behavior

If the `tools` argument to `@policy.build` is already a valid `var tools` collection, the builder should use it directly.

Imported tool collections should be first-class inputs to `@policy.build`. Callers should not have to redundantly import every underlying executable just so the builder can re-resolve names that were already validated when the `var tools` collection was created.

## Proposed fix

In `interpreter/env/builtins/policy.ts`:

- accept already-normalized/imported tool collections directly
- only call `normalizeToolCollection(...)` for raw object literals that have not already been normalized as a `var tools` value

Possible implementation approaches:

1. Preserve and read tool-collection metadata when a `var tools` value is passed into a builtin.
2. Teach `resolveToolCollection(...)` how to detect a canonical `ToolCollection` and use it as-is instead of re-resolving `mlld` refs in the current env.

The important behavior change is:

- **do not require current-env `env.getVariable(mlldName)` lookups for imported tool collections**

Out of scope for this bug: serializing execution-side tool metadata such as `labels` or `taintFacts`. This fix only needs to preserve the `AuthorizationToolContext` data required by auth-building consumers.

## Tests to add

1. `@policy.build` with a local `var tools` collection still works.
2. `@policy.build` with an imported `var tools` collection works even when the caller did not import the underlying exes.
3. The same imported collection continues to work with denied tools, proofless control args, and array control args.

## Impact

This bug makes cross-module use of `@policy.build` fail closed in a particularly confusing way:

- the auth intent looks correct
- the builder issues are easy to miss unless surfaced in debug output
- the final effect is an empty allow-list and blanket write denial

In the benchmark, it directly caused the apparent regression from:

- secure with nonzero utility-under-attack

to:

- secure with `0%` utility-under-attack

even though the authorization intent itself was correct.
