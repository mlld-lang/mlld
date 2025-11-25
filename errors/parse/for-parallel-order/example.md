# For Parallel Order Error

This error occurs when users write `for parallel N` instead of `for N parallel`.

## Wrong Syntax

```mlld
/for parallel 18 @item in @items => show @item
```

Error: "Wrong order for parallel syntax. The number must come BEFORE 'parallel'."

## Correct Syntax

```mlld
/for 18 parallel @item in @items => show @item
```

## Related Patterns

- `/for (cap, pace) parallel` - with both cap and rate limiting
- `for N parallel` - in for expressions within /var or /exe
