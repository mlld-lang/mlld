# Comparison Operators Test

Tests comparison operators in variable assignments.

## Input

```mlld
/var @a = "test"
/var @b = "test"
/var @c = "other"

/var @equal = @a == @b
/var @notEqual = @a != @c
/var @alsoNotEqual = @a == @c

/show "Equal: "
/show @equal
/show "\nNot Equal: "
/show @notEqual
/show "\nAlso Not Equal: "
/show @alsoNotEqual
```

## Expected Output

```
Equal: true
Not Equal: true
Also Not Equal: false
```