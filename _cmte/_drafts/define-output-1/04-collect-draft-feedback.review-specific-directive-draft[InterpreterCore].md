# Feedback on Draft TypeScript Types for @define Directive

Dear System Architect,

Thank you for providing the comprehensive type specification for the `@define` directive. After reviewing the proposal against our implementation needs in the InterpreterCore service, I'm pleased to confirm that your draft addresses most of our core requirements and will significantly improve code clarity and safety.

## Strengths of the Proposal

Your proposed types offer several important benefits:

1. **Discriminated Unions**: The `CommandDefinition` type with its `BasicCommandDefinition` and `LanguageCommandDefinition` variants provides excellent type safety and will eliminate our current manual type checking.

2. **Comprehensive Type Guards**: The inclusion of `isDefineDirectiveNode`, `isBasicCommand`, and `isLanguageCommand` will greatly reduce unsafe type assertions in our code.

3. **Clear Structure**: The `DefineDirectiveNode` interface provides a well-structured representation of define directives that aligns with our parsing needs.

4. **Utility Functions**: The parameter substitution and command storage/retrieval functions will standardize how we handle these operations across the codebase.

## Suggested Enhancements

While the proposal is strong, I'd like to suggest a few enhancements to fully address the challenges we face in the InterpreterCore service:

1. **Directive Result Type**: We need a specific `DefineDirectiveResult` interface that extends a base `DirectiveResult`. This would allow us to properly type the return value from directive handlers:

```typescript
export interface DirectiveResult {
  state: StateServiceLike;
  replacement?: MeldNode;
  getFormattingContext?(): FormattingContext;
}

export interface DefineDirectiveResult extends DirectiveResult {
  commandDefinition: CommandDefinition;
}

export function isDefineDirectiveResult(result: DirectiveResult): result is DefineDirectiveResult {
  return 'commandDefinition' in result;
}
```

2. **Handler Context Type**: A standardized `DirectiveHandlerContext` interface would help clarify what context we pass to directive handlers:

```typescript
export interface DirectiveHandlerContext {
  state: StateServiceLike;
  parentState: StateServiceLike;
  currentFilePath?: string;
  formattingContext: FormattingContext;
}
```

3. **Formatting Context**: The proposal should include the `FormattingContext` interface that's referenced in several places:

```typescript
export interface FormattingContext {
  isOutputLiteral: boolean;
  contextType: 'inline' | 'block';
  nodeType: string;
  atLineStart: boolean;
  atLineEnd: boolean;
}
```

## Implementation Impact

With these additions, we could significantly simplify our directive handling code. For example, we could replace complex type checks and property access guards with clean, type-safe code like:

```typescript
if (isDefineDirectiveNode(node)) {
  const result = await this.callDirectiveHandleDirective(node, context);
  
  if (isDefineDirectiveResult(result)) {
    // Type-safe access to commandDefinition
    const { commandDefinition } = result;
    // Store command in state with proper typing
    storeCommandDefinition(state, commandDefinition.name, commandDefinition);
  }
}
```

## Conclusion

Your proposal provides an excellent foundation for improving our `@define` directive handling. With the suggested enhancements to include directive result types and context interfaces, we'll have a complete type system that eliminates our current challenges with loose typing, ambiguous replacement handling, and unsafe property access.

I appreciate your thoughtful approach to this design and look forward to implementing these types in the InterpreterCore service.

Sincerely,
Lead Developer, InterpreterCore Service