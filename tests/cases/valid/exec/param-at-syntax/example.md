# Exe Parameter @ Syntax Test

This test verifies that exe parameters can be defined with or without @ prefix.

## With @ prefix (user-friendly syntax)
/exe @greetAt(@name) = js {("Hello, " + name + "!")}
/exe @addAt(@x, @y) = js {(Number(x) + Number(y))}

## Without @ prefix (traditional syntax)
/exe @greetPlain(name) = js {("Hello, " + name + "!")}
/exe @addPlain(x, y) = js {(Number(x) + Number(y))}

## Mixed syntax (both work)
/exe @greetMixed(@first, last) = js {("Hello, " + first + " " + last + "!")}

## Test execution
/run @greetAt("Alice")
/run @greetPlain("Bob")
/run @greetMixed("Charlie", "Brown")

/var @sum1 = @addAt(5, 3)
/var @sum2 = @addPlain(5, 3)
/show :::Sum with @: {{sum1}}, Sum without @: {{sum2}}:::