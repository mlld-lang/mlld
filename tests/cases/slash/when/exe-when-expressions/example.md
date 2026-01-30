# Exe When Expressions Test

Testing when expressions as values in exe assignments.

## Basic exe when expression
/exe @greet(name) = when [
  @name == "World" => "Hello, World!"
  @name == "Friend" => "Hey there, Friend!"
  * => "Welcome!"
]

Greetings:
/show @greet("World")
/show @greet("Friend")
/show @greet("Alice")

## Exe when with none fallback
/exe @statusHandler(code) = when [
  @code == 200 => "Success"
  @code == 404 => "Not Found"
  @code == 500 => "Server Error"
  none => "Unknown Status Code"
]

Testing status codes:
/show @statusHandler(200)
/show @statusHandler(404)
/show @statusHandler(403)
/show @statusHandler(999)

## Exe with language/env conditions
/var @lang = "es"
/exe @getMessage(type) = when [
  @lang == "es" && @type == "greeting" => "¡Hola!"
  @lang == "es" && @type == "farewell" => "¡Adiós!"
  @lang == "fr" && @type == "greeting" => "Bonjour!"
  @lang == "fr" && @type == "farewell" => "Au revoir!"
  @type == "greeting" => "Hello!"
  @type == "farewell" => "Goodbye!"
  * => "Unknown message type"
]

Messages:
/show @getMessage("greeting")
/show @getMessage("farewell")
/show @getMessage("other")

## Exe with bare when (first-match)
/exe @classifyNumber(n) = when [
  @n < 0 => "negative"
  @n == 0 => "zero"
  @n > 0 && @n < 10 => "small positive"
  @n >= 10 && @n < 100 => "medium positive"
  @n >= 100 => "large positive"
  none => "not a number"
]

>> First matching value is returned for bare when
/show @classifyNumber(5)
/show @classifyNumber(50)
/show @classifyNumber(-10)
/show @classifyNumber(150)

## Exe with code execution based on conditions

Define arithmetic operations as separate functions:
/exe @add(a, b) = js { return a + b }
/exe @multiply(a, b) = js { return a * b }
/exe @divide(a, b) = js { return a / b }

/exe @calculate(op, a, b) = when [
  @op == "add" => @add(@a, @b)
  @op == "multiply" => @multiply(@a, @b)
  @op == "divide" && @b != 0 => @divide(@a, @b)
  @op == "divide" => "Error: Division by zero"
  * => "Unknown operation"
]

Calculations:
/show @calculate("add", 5, 3)
/show @calculate("multiply", 4, 7)
/show @calculate("divide", 10, 2)
/show @calculate("divide", 10, 0)
/show @calculate("subtract", 10, 3)

## Exe with pipeline modifiers
/exe @format(type, data) = when [
  @type == "json" => @data | @json
  @type == "pretty" => @data | @json
  true => @data
]

/var @myData = { name: "Test", value: 42 }

Formatted output:
/show @format("json", @myData)
/show @format("pretty", @myData)
/show @format("plain", "just text")
