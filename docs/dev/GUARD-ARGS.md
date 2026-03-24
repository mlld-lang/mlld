# Guard Args Spec

## Goal

Expose named operation inputs to guards and denied handlers without changing existing
`@input` behavior.

This adds a guard-only namespace:

- `@mx.args.<argname>`
- `@mx.args["<argname>"]`
- `@mx.args.names`

`@input` remains the positional input surface:

- per-operation guards: array of inputs
- per-input guards: current labeled value

## Public API

Inside guard bodies and denied handlers:

- `@mx.args.url` returns the variable/value passed to the `url` parameter
- `@mx.args.url.mx.labels` returns per-arg labels
- `@mx.args["repo-name"]` supports names that are not dot-safe
- `@mx.args.names` returns the list of available named inputs in positional order

Outside guard context, `@mx.args` is not guaranteed to exist.

## Reserved Name Behavior

`names` is reserved as the discovery property.

- `@mx.args.names` always returns the list of available arg names
- `@mx.args["names"]` returns the actual argument named `names`, if present

This keeps dot access ergonomic while preserving an escape hatch for collisions.

## Input Semantics

`@mx.args` always refers to operation inputs, not outputs.

- before-guards: current effective inputs for the operation
- after-guards: the inputs that reached execution after any before-guard/user-hook transforms
- denied handlers: the input snapshot captured on the denying guard context

For direct exec invocation, named args come from the executable parameter list.

For partial executables, bound arguments participate in the effective named input set if they
align to declared parameters.

For pipeline stages, named args come from the effective stage parameter binding:

- the first pipeline-bound parameter is exposed under its declared parameter name
- additional explicit parameters are exposed under their declared parameter names

Operations without declared parameter names do not expose named args.

## Missing And Extra Inputs

`@mx.args.names` lists the named inputs that are actually present in the current guard input
set. Extra positional inputs without declared parameter names remain accessible through
`@input[n]` only.

## Runtime Representation

Guard context stores a plain named-args snapshot:

- `names: string[]`
- `values: Record<string, Variable>`

Ambient `@mx.args` is a specialized runtime view over that snapshot with these rules:

- dot access to `names` returns the reserved list
- bracket access to `"names"` resolves the actual arg named `names`
- bracket access to any other key resolves the actual named arg value

## Safety Requirements

- The runtime view must use a null-prototype object
- The field-access layer must distinguish dot access from bracket access for `@mx.args`
- Guard-context cloning/redaction must preserve named args and redact secret variables the
  same way existing guard input snapshots do

## Tests

Add coverage for:

- direct exec guard access via `@mx.args.<name>`
- reserved `names` behavior
- bracket access to non-dot-safe names
- denied handler access via `@mx.guard.args` and `@mx.args`
- pipeline stage access to named inputs
