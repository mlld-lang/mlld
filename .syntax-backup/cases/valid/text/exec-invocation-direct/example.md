# Test exec invocation without @run

@exec greet() = [(echo "Hello, direct exec!")]
@exec withParam(name) = [(echo "Hello, @name!")]
@exec multiArg(a, b) = [(echo "@a and @b")]

## Direct exec invocation in text
@text result1 = @greet()
@add @result1

## With parameter
@text result2 = @withParam("Alice")
@add @result2

## Multiple arguments
@text result3 = @multiArg("foo", "bar")
@add @result3

## Variable argument
@text userName = "Bob"
@text result4 = @withParam(@userName)
@add @result4