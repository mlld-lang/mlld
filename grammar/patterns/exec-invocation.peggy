// EXEC INVOCATION - Unified exec command invocation with tail support
// Used by: All directives that accept exec invocations
// Purpose: Parse exec invocations with optional tail modifiers

ExecInvocationWithTail "exec invocation"
  = ref:CommandReference tail:TailModifiers? {
      return {
        type: 'ExecInvocation',
        commandRef: ref,
        withClause: tail || null
      };
    }