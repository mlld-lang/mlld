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

### Nested For Loops
For loops can be nested to iterate over multiple collections:

```mlld
/for @x in ["A", "B"] => for @y in [1, 2] => show "@x-@y"
```

Output:
```
A-1
A-2
B-1
B-2
```

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

## Debugging

When for loops fail silently or behave unexpectedly, mlld provides built-in debugging support to help you understand execution.

### Using DEBUG_FOR

Use the `DEBUG_FOR` environment variable to get detailed visibility into for loop execution:

```bash
DEBUG_FOR=1 mlld run script.mld
```

This outputs:
- Collection type and size before iteration starts
- Preview of the first few items
- Progress for each iteration (e.g., "iteration 2/5")
- Current item value and key (for objects)
- Action type being executed
- Completion status for each iteration
- Total iterations completed

Example output:
```
[DEBUG_FOR] For loop starting: {
  directive: '/for',
  variable: 'item',
  collectionType: 'array',
  collectionSize: 3,
  location: '6:1'
}
[DEBUG_FOR] Collection preview: {
  firstItems: [
    { key: null, value: 'apple' },
    { key: null, value: 'banana' },
    { key: null, value: 'cherry' }
  ]
}
[DEBUG_FOR] For loop iteration 1/3: {
  variable: 'item',
  currentValue: 'apple',
  currentKey: null,
  hasKey: false
}
```

### Error Debugging

When an error occurs in a for loop, the debug output helps identify exactly which iteration failed:

```
[DEBUG_FOR] For loop iteration 3/4: {
  variable: 'item',
  currentValue: null,
  currentKey: null,
  hasKey: false
}
Error: Cannot process null item
```

This shows the error occurred on iteration 3 of 4, with a null value.

### Object Iteration Debugging

When iterating over objects, the debug output shows both keys and values:

```mlld
/var @config = {"host": "localhost", "port": 3000}
/for @value in @config => /show "@value_key: @value"
```

Debug output:
```
[DEBUG_FOR] For loop iteration 1/2: {
  variable: 'value',
  currentValue: 'localhost',
  currentKey: 'host',
  hasKey: true
}
```

### Debug Environment Variables

```bash
DEBUG_FOR=1 mlld run script.mld           # For loop debugging only
MLLD_DEBUG=true mlld run script.mld       # General mlld debugging (includes for loops)
DEBUG_FOR=1 mlld run script.mld 2>&1      # Capture debug output with regular output
```

Note: Debug output is sent to stderr, so use `2>&1` to see it with regular output.

### Debugging Strategies

1. **Pre-loop Inspection**: Always inspect your data before the loop
   ```mlld
   /var @items = <*.md>
   /show "Processing @items.length items"
   ```

2. **Add Progress Indicators**: Use `/show` statements to track execution
   ```mlld
   /for @item in @items => /show "Processing: @item"
   ```

3. **Manual Unrolling**: For critical debugging, temporarily unroll the loop
   ```mlld
   >> Instead of: /for @file in @files => @process(@file)
   >> Use:
   @process(@files[0])
   @process(@files[1])
   @process(@files[2])
   ```

4. **Start Small**: Test with array slicing
   ```mlld
   /var @subset = @items.slice(0, 3)
   /for @item in @subset => @process(@item)
   ```

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