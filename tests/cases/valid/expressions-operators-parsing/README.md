# Expression Operators in mlld

## Supported Operators

mlld supports the following operators for logical expressions:

- `&&` - Logical AND
- `||` - Logical OR  
- `==` - Equality comparison
- `!=` - Inequality comparison
- `!` - Logical NOT (unary)
- `? :` - Ternary conditional

## Intentionally Excluded Operators

The following operators are NOT supported by design:

- `<`, `>`, `<=`, `>=` - Numeric comparisons (mlld is for routing, not math)
- `+`, `-`, `*`, `/`, `%` - Arithmetic operators
- `??` - Nullish coalescing (use `||` for defaults)
- `?.` - Optional chaining (mlld already handles undefined gracefully)

## Usage Guidelines

### In Variable Assignments
- ✅ Use `==` and `!=` for boolean results
- ✅ Use `? :` for conditional assignments
- ✅ Use `||` for default values
- ⚠️ Avoid `&&` in assignments (confusing semantics)

### In When Conditions
All operators work well for conditional routing:
- `/when @a && @b => action`
- `/when @a || @b => action`
- `/when @a == @b => action`
- `/when !@a => action`