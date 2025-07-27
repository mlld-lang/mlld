# Logical Operators with Variables

Tests && and || operators with variable operands.
Note: The behavior follows JavaScript short-circuit evaluation.

## Input

```mlld
/var @a = "first"
/var @b = "second"
/var @empty = ""
/var @nullVar = null

>> && returns the first falsy value or the last value
/var @and1 = @a && @b
/var @and2 = @empty && @b
/var @and3 = @nullVar && @b

>> || returns the first truthy value or the last value
/var @or1 = @a || @b
/var @or2 = @empty || @b
/var @or3 = @nullVar || @b

/show "AND Results:\n"
/show "@a && @b = "
/show @and1
/show "\n@empty && @b = "
/show @and2
/show "\n@nullVar && @b = "
/show @and3

/show "\n\nOR Results:\n"
/show "@a || @b = "
/show @or1
/show "\n@empty || @b = "
/show @or2
/show "\n@nullVar || @b = "
/show @or3
```

## Expected Output

```
AND Results:
@a && @b = second
@empty && @b = 
@nullVar && @b = null

OR Results:
@a || @b = first
@empty || @b = second
@nullVar || @b = second
```