# For Loops

The `/for` directive and `for` expression enable iteration over collections in mlld, providing a simpler alternative to the `foreach` operator for basic iteration needs.

## For Directive

The `/for` directive iterates over a collection and executes an action for each item:

```mlld
/for @<item> in @<collection> => <action>
```

Where:
- `@<item>` - Variable that holds the current item during iteration
- `@<collection>` - Array or object to iterate over
- `<action>` - Directive to execute for each item (typically `/show`)

### Array Iteration

```mlld
/var @fruits = ["apple", "banana", "cherry"]
/for @fruit in @fruits => /show `- @fruit`
```

Output:
```
- apple
- banana  
- cherry
```

### Object Iteration

When iterating over objects, the value is available in the iteration variable, and the key is available as `@<var>_key`:

```mlld
/var @config = {"host": "localhost", "port": 3000, "secure": true}
/for @value in @config => /show `@value_key: @value`
```

Output:
```
host: localhost
port: 3000
secure: true
```

## For Expression

The `for` expression collects results from iterating over a collection:

```mlld
/var @<result> = for @<item> in @<collection> => <expression>
```

This creates an array containing the result of evaluating the expression for each item.

### Basic Collection

```mlld
/var @numbers = [1, 2, 3, 4, 5]
/var @doubled = for @n in @numbers => @n * 2
/show @doubled  # [2, 4, 6, 8, 10]
```

### String Transformation

```mlld
/var @names = ["alice", "bob", "charlie"]
/var @greetings = for @name in @names => `Hello, @name!`
/show @greetings
```

Output:
```
["Hello, alice!", "Hello, bob!", "Hello, charlie!"]
```

## Key Features

### Variable Scoping
- The iteration variable is only available within the for loop
- Each iteration has its own scope
- Original variables are not modified

### Empty Collections
- Iterating over an empty array executes no actions
- For expressions with empty arrays return empty arrays

```mlld
/var @empty = []
/for @item in @empty => /show @item  # No output
/var @results = for @x in @empty => @x * 2
/show @results  # []
```

### Type Preservation
- Values maintain their Variable wrapper type during iteration
- Field access and operations work as expected

## Comparison with Foreach

While `foreach` is designed for complex operations with parameterized commands and cartesian products, `/for` provides a simpler syntax for basic iteration:

| Feature | `/for` | `foreach` |
|---------|--------|-----------|
| Simple iteration | ✓ | ✓ |
| Cartesian product | ✗ | ✓ |
| Parameterized commands | ✗ | ✓ |
| Inline expressions | ✓ | ✗ |
| Object key access | ✓ (`@var_key`) | ✗ |

Choose `/for` for straightforward iteration tasks, and `foreach` for complex transformations requiring parameterized commands or multiple array combinations.