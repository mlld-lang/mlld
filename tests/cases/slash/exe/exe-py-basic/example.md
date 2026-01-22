# Basic Python Execution Test

This test verifies basic Python execution with return values.

## Test simple function with return value

/exe @add(a, b) = py {
result = int(a) + int(b)
print(result)
}

/var @sum = @add(5, 3)
/show `Sum: @sum`

## Test string return

/exe @greet(name) = py {
print(f"Hello, {name}!")
}

/var @greeting = @greet("World")
/show @greeting

## Test expression evaluation

/exe @square(x) = py {
print(int(x) ** 2)
}

/var @squared = @square(4)
/show `4 squared is @squared`
