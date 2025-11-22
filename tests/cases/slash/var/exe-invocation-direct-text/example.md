# Test exec invocation without run

/exe @greet() = cmd {echo "Hello, direct exec!"}
/exe @withParam(name) = cmd {echo "Hello, @name!"}
/exe @multiArg(a, b) = cmd {echo "@a and @b"}

## Direct exec invocation in text
/var @result1 = @greet()
/show @result1

## With parameter
/var @result2 = @withParam("Alice")
/show @result2

## Multiple arguments
/var @result3 = @multiArg("foo", "bar")
/show @result3

## Variable argument
/var @userName = "Bob"
/var @result4 = @withParam(@userName)
/show @result4