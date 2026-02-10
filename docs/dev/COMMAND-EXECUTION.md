# COMMAND EXECUTION

## OVERVIEW

`interpreter/eval/pipeline/command-execution.ts` is the orchestration entrypoint for pipeline-stage executable invocation.

It keeps public API contracts:

- `resolveCommandReference(command, env)`
- `executeCommandVariable(commandVar, args, env, stdinInput?, structuredInput?, hookOptions?)`

## DATA FLOW

Execution flow follows this sequence:

1. Resolve command reference for pipeline invocation.
2. Normalize executable descriptor (`normalize-executable`).
3. Bind pipeline parameters (`bind-pipeline-params`).
4. Run preflight checks:
   - guard preflight (`preflight/guard-preflight`)
   - policy preflight (`preflight/policy-preflight`)
5. Dispatch to a branch handler:
   - command/provider: `handlers/execute-command`
   - code family: `handlers/execute-code`
   - node function/class: `handlers/execute-node`
   - template: `handlers/execute-template`
   - command reference recursion: `handlers/execute-command-ref`
6. Finalize output wrapping and descriptor merge (`finalize-result`).

## MODULE BOUNDARIES

Boundary rules:

- `command-execution.ts` orchestrates only.
- Each handler owns one branch family and returns branch-local outputs.
- Shared utilities stay in `command-execution/*` utility modules.
- Handlers do not import `command-execution.ts`.

## CONTRACTS

Runtime contracts:

- Command/provider/code/node/template/commandRef branch selection stays stable.
- Retry signals keep shape (`'retry'` or `{ value: 'retry', ... }`) where supported.
- Structured output wrapping and policy descriptor merge stay consistent with characterization tests.
- Node EventEmitter and legacy stream rejection behavior stays stable.

## DEPENDENCY DIRECTION

Dependency direction is one-way:

- Orchestrator imports handlers and utilities.
- Handlers import shared utilities and runtime services.
- Handlers do not depend on orchestrator internals.

## VERIFICATION

Verification relies on:

- characterization coverage in `interpreter/eval/pipeline/command-execution.characterization.test.ts`
- branch handler tests in `interpreter/eval/pipeline/command-execution/handlers/*.test.ts`
- full gate:
  `npm run build && npm test && npm run test:tokens && npm run test:examples`
