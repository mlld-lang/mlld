Meld is a prompt scripting language. You are the architect of this codebase. 

We are in the process of implementing your rearchitecture plan. While completing the implementation of the services, our developer encountered some inconsistencies between the architecture and meld's intended UX.

For reference, here's the target UX:

=== TARGET UX SPEC / NOTES

@import[docs/UX.md]

=== /end TARGET UX SPEC / NOTES

Here's the note from our developer: 

=== DEVELOPER NOTE

Dear Architect,

I'm writing to propose some significant architectural changes based on a careful review of our UX.md specification. I've identified a gap in our current architecture around variable resolution and directive dependencies that I believe needs to be addressed.

### The Core Issue

The UX.md spec defines several critical relationships between directives that our current architecture doesn't fully address. For example:

1. Command Dependencies:
```meld
@define greet(name) = @run [echo "Hello ${name}"]
@text greeting = @run [$greet(${user})]
```
This shows that `@run` directives depend on `@define` directives, and both involve variable resolution.

2. Variable Resolution Contexts:
From the spec:
```
Different contexts have different resolution rules:
- Path Context: Must start with $HOMEPATH or $PROJECTPATH
- Command Context: Allows text variables (${var}) and path variables ($path)
- Text Context: Allows all variable types
- Data Context: Allows field access (#{data.field})
```

3. Path Security:
The spec states: "All paths must be absolute (via $HOMEPATH/$PROJECTPATH)" and "Relative paths not allowed for security".

### Proposed Changes

To address these requirements, I propose three main architectural changes:

1. **New ResolutionService**: A dedicated service for all variable resolution, handling:
   - Text variables (${var})
   - Data variables and fields (#{data.field})
   - Path variables ($path)
   - Command references ($command(args))

2. **Refocused StateService**: Change StateService to focus purely on storage:
   - Store raw values without processing
   - Maintain state hierarchy
   - No resolution logic (moved to ResolutionService)

3. **Reorganized DirectiveService**: Split handlers into:
   - Definition handlers (@text, @data, @path, @define)
   - Execution handlers (@run, @embed, @import)

### Rationale

This reorganization is driven by several key requirements from the spec:

1. **Variable Resolution Rules**: The spec states specific rules for each context. For example:
```
Path Context:
• Allows path variables ($path)
• Allows text variables (${var})
• Disallows data variables
• Must start with $HOMEPATH or $PROJECTPATH
```
The new ResolutionService enforces these rules centrally.

2. **Command Dependencies**: The spec shows that commands defined by `@define` are used by `@run`. Our new architecture makes this explicit:
   - DefineHandler stores raw command definition
   - RunHandler uses ResolutionService to resolve command
   - ResolutionService manages the dependency

3. **Security Requirements**: The spec states: "Circular imports detected and errored pre-execution". The new architecture:
   - Detects circular references in ResolutionService
   - Validates path security consistently
   - Enforces context-specific rules

### Impact on Testing

The spec states: "Silent fail in meld build output" and "Warn on command line". Our new architecture supports this by:
1. Centralizing error handling in ResolutionService
2. Providing clear error types for different failure modes
3. Making testing more focused and explicit

### Conclusion

This reorganization better aligns our architecture with the spec's requirements while improving:
- Separation of concerns (storage vs. resolution)
- Security enforcement
- Error handling
- Testing clarity

I believe these changes will make our codebase more maintainable and more faithful to the spec's requirements.

Would you like me to provide more detail about any aspect of these changes?

Best regards,
Claude, Developer

=== / end DEVELOPER NOTE

Here are the `meld-ast`, `llmxml` readmes:

=== MELD-AST and LLMXML

@import[../meld-ast/README.md]

@import[../llmxml/README.md]

=== /end MELD-AST and LLMXML

Here are the `meld-spec` types:

=== MELD SPEC TYPES

@cmd[cpai ../meld-spec/src/types/ --stdout]

=== / end MELD SPEC TYPES 

Here are your design documents:

(Note that these have been revised by our developer, who has added a ResolutionService based on observations.)

=== NEW ARCHITECTURE DESIGN DOCS

@import[dev/arch--overview.md]

@import[dev/arch--tests.md]

@import[dev/service-state.md]

@import[dev/service-path-fs.md]

@import[dev/service-validation.md]

@import[dev/service-directive.md]

@import[dev/service-interpreter.md]

@import[dev/service-output.md]

=== / end NEW ARCHITECTURE DESIGN DOCS

Here's the work in progress code:

=== CODE 

@cmd[cpai cli core sdk services --stdout]

=== / end CODE 

=== NEW RESOLUTION SERVICE SPEC

@import[dev/service-resolution.md]

=== / end NEW RESOLUTION SERVICE SPEC

Here is our developer's updated plan and progress tracker:

=== UPDATED DEV PLAN 

@import[dev/arch--plan.md]

=== / end UPDATED DEV PLAN

=== YOUR TASK

Having reviewed all of the above, your task is to consider all of the above within the context of our UX spec, particularly the letter from our developer and their new resolution service spec and revisions to our docs.

Reply to the letter and analyze the new addition of the resolution service.

In your analysis, focus on:
- achievieving the target UX
- SOLID, maintainable architecture
- consistency in implementation
- deviations from the above in the design/plan docs

 DO NOT be hand wavy. Be decisive in your opinions and clear in your direction.