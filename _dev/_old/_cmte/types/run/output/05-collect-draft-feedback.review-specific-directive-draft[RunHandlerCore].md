# To: System Architect
# From: Lead Developer, RunHandlerCore Service
# Re: Review of Draft TypeScript Types for @run Directive

Dear Architect,

Thank you for sharing the draft TypeScript types for the `@run` directive. I've thoroughly reviewed the proposal against our current implementation and requirements.

## Overall Assessment

The proposed type system is **excellent** and addresses all the core needs we previously identified. The discriminated union pattern for the `RunDirective` type will significantly simplify our code by:

1. Enabling proper type narrowing with the `type` discriminator
2. Providing clear, distinct interfaces for each run subtype
3. Supporting compile-time validation of subtype-specific properties

## Specific Strengths

- **Clear Subtype Classification**: The discriminated union with `BasicCommandRun`, `LanguageCommandRun`, and `DefinedCommandRun` perfectly aligns with our current classification logic.
- **Parameter Handling**: The structured `Parameter` and `CommandArg` types will standardize parameter resolution across all subtypes.
- **Command References**: The unified `CommandReference` type elegantly handles both string-based and AST-based references.
- **Execution Context**: The comprehensive `ExecutionContext` interface provides the security controls we need.
- **Command Definition**: The `CommandDefinition` interface adds much-needed structure to our command templates.

## Implementation Benefits

With these types, we can:
1. Replace our current string-based subtype classification with proper TypeScript type guards
2. Standardize parameter resolution across all command types
3. Implement a unified execution interface via the `IRunDirectiveExecutor`
4. Provide better error messages through structured validation

## Suggestions for Enhancement

While the proposal is strong, I'd suggest two minor additions:

1. Add a `captureOutput: boolean` flag to `RunDirectiveBase` to control whether command output should be captured and returned
2. Consider adding an optional `timeout` property to each run subtype to override the global execution timeout

## Conclusion

This type system will enable the code simplifications we hoped for and provide a solid foundation for future enhancements. I'm particularly pleased with how the discriminated union pattern will eliminate our current string-based subtype checking.

We're ready to implement these types in our service immediately.

Best regards,

Lead Developer
RunHandlerCore Service