# To: System Architect
## Re: TypeScript Types for @embed Directive

Thank you for the comprehensive type proposal for the `@embed` directive. I've reviewed it in detail, considering how it would integrate with the InterpreterCore service.

The proposed discriminated union pattern with `embedType` as the discriminator is an excellent approach that will significantly improve our code. The type guards (`isPathEmbed`, `isVariableEmbed`, `isTemplateEmbed`) will eliminate the complex runtime type checking we currently perform in the interpreter service, particularly in the transformation logic for variable-based embeds.

I particularly appreciate:

1. The `VariableReference` interface that properly captures field access patterns
2. The `ResolutionContextFactory` which standardizes context creation for different embed types
3. The explicit `disablePathPrefixing` and `preventPathPrefixing` flags that address our recurring path prefixing bugs

These types will allow us to simplify several code sections in the InterpreterService, especially:
- The special handling for variable-based embeds (lines 478-505)
- The complex type detection logic currently scattered across directive handlers
- The ad-hoc property checks for resolution contexts

One suggestion: could we add a `transformationOptions` field to the `ResolutionContext` interface? This would help propagate transformation settings consistently across service boundaries, which would further simplify our code.

Overall, this proposal exceeds my expectations and will enable the code simplifications I identified. The discriminated union pattern will make our code more maintainable and type-safe, reducing the likelihood of bugs in the embed directive handling.

I'm ready to implement these types in the InterpreterCore service.

Regards,
Lead Developer, InterpreterCore Service