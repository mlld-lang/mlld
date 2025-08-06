---
updated: 2025-08-06
tags: #arch, #interpreter, #iterators
related-docs: docs/for.md, docs/foreach.md
related-code: interpreter/eval/for.ts, interpreter/eval/data-value-evaluator.ts, interpreter/utils/cartesian-product.ts
related-types: core/types { ForDirective, ForExpression, ForeachCommandExpression }
---

# Iterators Development Guide

## tldr

mlld provides two iteration mechanisms:
- **`/for`**: Simple iteration over collections with actions (`/for @item in @items => action`)
- **`foreach`**: Cartesian product over multiple arrays with parameterized commands (`foreach @cmd(@arr1, @arr2)`)

Both follow mlld's single-pass evaluation and direct execution principles.

## Principles

- Single-pass evaluation (no resolution phase)
- Child environments for iteration scope
- Variable type preservation through iterations
- Direct evaluation without orchestration
- Fail fast with detailed error context

## Details

### /for Directive

**Entry points**: `interpreter/eval/for.ts`, `grammar/directives/for.peggy`

The `/for` directive provides simple iteration with two forms:

```mlld
# Output form - executes actions for each item
/for @item in @collection => /show @item

# Collection form - returns array of results  
/var @results = for @item in @collection => expression
```

Key characteristics:
- Single action per iteration (no block syntax)
- Child environment per iteration with Variable preservation
- Object iteration exposes keys via `@var_key` pattern
- ForExpression returns ArrayVariable with metadata
- Error collection continues execution

### foreach Operator

**Entry points**: `interpreter/eval/data-value-evaluator.ts`, `grammar/directives/data.peggy`

The `foreach` operator generates cartesian products:

```mlld
/exe @test(model, prompt) = {test "@model" "@prompt"}
/data results = foreach @test(@models, @prompts)
```

Key characteristics:
- Multiple array support with cartesian product
- Parameterized command execution
- Lazy evaluation as complex data variable
- Performance limits (10,000 combinations max)
- Parameter count validation

### Variable Type Preservation

Both iterators preserve Variable wrappers to maintain type information:

```typescript
// /for - preserves Variable wrappers
childEnv.set(varName, value);  // value may be a Variable

// foreach - creates appropriate Variable types
if (typeof paramValue === 'string') {
  childEnv.setVariable(paramName, {
    type: 'text',
    name: paramName,
    value: paramValue,
    definedAt: null
  });
}

### Evaluation Patterns

```typescript
// /for directive evaluation
export async function evaluateForDirective(
  directive: ForDirective,
  env: Environment
): Promise<void> {
  const iterable = toIterable(sourceResult);
  
  for (const [key, value] of iterable) {
    const childEnv = env.createChildEnvironment();
    childEnv.set(varName, value);
    
    // Object key binding pattern
    if (key !== null && typeof key === 'string') {
      childEnv.set(`${varName}_key`, key);
    }
    
    await evaluateNodes(directive.values.action, childEnv);
  }
}

// foreach evaluation with cartesian product
async function evaluateForeachCommand(
  foreachExpr: any,
  env: Environment
): Promise<any[]> {
  const tuples = cartesianProduct(evaluatedArrays);
  
  for (const tuple of tuples) {
    const argMap: Record<string, any> = {};
    params.forEach((param: string, index: number) => {
      argMap[param] = tuple[index];
    });
    
    const result = await invokeParameterizedCommand(cmdVariable, argMap, env);
    results.push(result);
  }
}


### Error Handling

Both iterators provide detailed error messages:

```typescript
// /for errors include directive context
throw new MlldDirectiveError(
  'for',
  `Cannot iterate over ${typeof sourceResult}`,
  directive
);

// foreach errors include iteration context
`Error in foreach iteration ${i + 1} (${iterationContext}): ${error.message}`
```

## Gotchas

- NEVER consume @ before delegating to UnifiedReferenceWithTail in grammar
- Child environment nodes must be transferred to parent in /for loops
- Variables preserve wrappers through iteration for type consistency
- Cartesian product limited to 10,000 combinations for performance

## Debugging

### Grammar Issues
```bash
# Test /for parsing
npm run ast -- '/for @item in @items => @echo(@item)'

# Test foreach parsing  
npm run ast -- '@data results = foreach @cmd(@arr)'
```

### Interpreter Issues
- Enable debug logging: `DEBUG_FOR=1` or `DEBUG_EXEC=1`
- Check wrapped content structure in for loop actions
- Verify child environment node transfer
- Monitor Variable type preservation through iterations