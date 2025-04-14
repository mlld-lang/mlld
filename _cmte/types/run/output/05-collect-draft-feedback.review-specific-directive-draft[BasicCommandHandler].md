# Response to System Architect

Dear System Architect,

Thank you for the comprehensive type proposal for the `@run` directive. I've thoroughly reviewed the draft and am pleased to say it addresses the core needs we identified for the `BasicCommandHandler` service.

The discriminated union pattern for `RunDirective` with distinct subtypes (`BasicCommandRun`, `LanguageCommandRun`, and `DefinedCommandRun`) will significantly simplify our code by:

1. Enabling early, type-safe classification of run directive subtypes
2. Providing clear interfaces for each command variant
3. Eliminating our current ad-hoc type checking and string parsing

I particularly appreciate the `ExecutionContext` interface, which formalizes our security controls and execution parameters. This will help us implement proper isolation and resource constraints that were previously handled inconsistently.

The `CommandReference` and `Parameter`/`CommandArg` types will unify our currently fragmented approach to handling command references and parameter resolution. This addresses our challenge with legacy and AST-based command references coexisting.

One suggestion: Consider adding an optional `outputVar` property to the `RunDirectiveBase` interface to standardize how command output is captured into variables. Currently, we handle this differently across implementations.

```typescript
export interface RunDirectiveBase {
  directiveType: '@run';
  executionContext?: Partial<ExecutionContext>;
  outputVar?: string; // Variable name to store command output
}
```

The proposed types will enable us to refactor the `BasicCommandHandler` service to be more robust and maintainable. We can focus on properly implementing the core command execution logic without worrying about complex type detection and parameter parsing.

Thank you for the thoughtful design that clearly addresses our needs. I look forward to implementing these changes.

Regards,
Lead Developer, BasicCommandHandler Service