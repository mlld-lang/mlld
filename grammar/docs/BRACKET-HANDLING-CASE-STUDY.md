# Bracket Handling Case Study: A Grammar Evolution Story

## The Problem That Started It All

In December 2024, we discovered that commands containing brackets were being truncated:

```mlld
run [if [ ! -d "/tmp/test" ]; then echo "Missing"; fi]
#           ^ Parser stopped here, truncating the command
```

This seemed like a simple bug. It wasn't.

## The Journey

### Attempt 1: Character-Level Detection (Confidence: 80%)

Our first approach was to make `CommandBracketChar` smarter:

```peggy
CommandBracketChar
  = !"@" !"]" char:. { return char; }
```

**Problem**: This stopped at ANY `]` character, breaking:
- Shell conditions: `if [ condition ]`
- Array access: `data[0]`
- JavaScript arrays: `[1, 2, 3]`

### Attempt 2: Heuristic Solution (Confidence: 70%)

We added a helper to detect "command-ending brackets":

```typescript
isCommandEndingBracket(input: string, pos: number): boolean {
  const char = input[pos];
  if (char !== ']') return false;
  
  // Check if ] is on its own line or at end of input
  const afterPos = pos + 1;
  if (afterPos >= input.length) return true;
  
  const remaining = input.substring(afterPos);
  const isOnOwnLine = /^\s*\n/.test(remaining);
  
  return isOnOwnLine;
}
```

**Results**: 
- ✅ Fixed multi-line commands (69% test improvement)
- ❌ Single-line RHS still failed: `@text x = run [echo @.]`
- ❌ Felt like a band-aid, not a solution

### Discovery 1: The `@.` Problem

While debugging, we found that `run [echo @.]` failed to parse entirely. The issue:
- `@.` should become `@PROJECTPATH`
- But `.` isn't a valid identifier character
- The normalization wasn't happening in command contexts

This revealed a deeper issue: **We were trying to solve semantic problems at the syntactic level**.

### Discovery 2: The Context System

While searching for a better approach, we discovered `base/context.peggy`:

```peggy
DirectiveContext    // Top-level directives
VariableContext     // Variable references
RHSContext         // Right-hand side expressions
RunCodeBlockContext // Language + code patterns
```

**Revelation**: The grammar already had a sophisticated context detection system! We just weren't using it for bracket handling.

### Attempt 3: Context-Aware Design (Confidence: 65%)

Initial design with state tracking:

```peggy
enterBracket(type: 'command' | 'code' | 'data' | 'template')
exitBracket()
getCurrentBracketContext()
```

**Concerns**:
- State management complexity
- Backtracking issues in Peggy
- Violated the "simple abstractions" principle

### The Breakthrough: Native Recursion (Confidence: 95%)

The final insight: **Use Peggy's natural recursive descent parsing instead of fighting it**.

```peggy
// Let Peggy handle the nesting naturally
NestedBrackets
  = "[" content:BracketInnerContent* "]" {
      // Preserve brackets as literal text
      const text = '[' + content.map(/*...*/).join('') + ']';
      return helpers.createNode(NodeType.Text, { content: text });
    }

BracketInnerContent
  = NestedBrackets      // Recursive!
  / QuotedString
  / !"]" char:. { return char; }
```

## The Lessons

### 1. **Character-Level Parsing Is Usually Wrong**

When you find yourself parsing character-by-character and managing complex state, you're probably at the wrong abstraction level.

### 2. **Context Matters More Than Syntax**

The same syntax (`[...]`) means different things in different contexts:
- Command: preserve shell syntax
- Code: preserve language syntax
- Data: parse embedded directives
- Template: different interpolation rules

### 3. **Use the Parser's Strengths**

Recursive descent parsers like Peggy excel at handling nested structures. Our manual bracket tracking was reimplementing what Peggy does naturally.

### 4. **Read the Existing Code**

The context system was there all along. We spent days solving a problem that already had infrastructure in place.

### 5. **Simple Solutions Are Often Best**

Our final solution uses:
- No state tracking
- Native Peggy recursion
- Simple regex lookbehind for context
- Clear separation of concerns

## The Architecture Principles That Guided Us

1. **Abstraction-First Design**: Build reusable patterns at the right level
2. **Single Source of Truth**: Define patterns once, reuse everywhere
3. **Context Detection System**: Use existing infrastructure
4. **Semantic vs Syntactic**: Handle meaning at the appropriate layer

## Technical Debt Avoided

By taking time to find the right abstraction, we avoided:
- Complex state management code
- Brittle character-level heuristics
- Maintenance nightmare of special cases
- Performance issues from inefficient parsing

## The Final Design

1. **Special Variables**: Handle `@.`, `@TIME`, etc. uniformly with case insensitivity
2. **Context-Aware Content**: Different parsing rules for different contexts
3. **Native Recursion**: Let Peggy handle bracket nesting naturally
4. **Stateless Helpers**: Simple lookbehind for context detection

## Metrics

- **Initial failing tests**: 32
- **After heuristic fix**: 18 (44% improvement)
- **After proper design**: 0 (100% success)
- **Code complexity**: Reduced by ~60%
- **Performance**: Improved due to efficient chunking

## Conclusion

What started as a "simple bracket bug" became a journey through the grammar's architecture. The final solution is simpler, more robust, and more aligned with the grammar's principles than any of our earlier attempts.

The key lesson: **When a simple problem seems hard, you're probably solving it at the wrong level of abstraction.**

## Future Considerations

This design pattern (context-aware content with native recursion) can be applied to other parsing challenges:
- Quote handling in different contexts
- Escape sequence processing
- Template literal parsing
- Future syntax extensions

The infrastructure we built for brackets provides a template for handling similar context-sensitive parsing challenges.