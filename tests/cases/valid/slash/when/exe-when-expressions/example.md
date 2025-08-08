# Exe When Expressions Test

Testing when expressions as values in exe assignments.

## Basic exe when expression
/exe @greet(name) = when: [
  @name == "World" => "Hello, World!"
  @name == "Friend" => "Hey there, Friend!"
  true => "Welcome!"
]

Greetings:
/show @greet("World")
/show @greet("Friend")
/show @greet("Alice")

## Exe with language/env conditions
/var @lang = "es"
/exe @getMessage(type) = when: [
  @lang == "es" && @type == "greeting" => "¡Hola!"
  @lang == "es" && @type == "farewell" => "¡Adiós!"
  @lang == "fr" && @type == "greeting" => "Bonjour!"
  @lang == "fr" && @type == "farewell" => "Au revoir!"
  @type == "greeting" => "Hello!"
  @type == "farewell" => "Goodbye!"
  true => "Unknown message type"
]

Messages:
/show @getMessage("greeting")
/show @getMessage("farewell")
/show @getMessage("other")

## Exe with code execution based on conditions

Define arithmetic operations as separate functions:
/exe @add(a, b) = js { return a + b }
/exe @multiply(a, b) = js { return a * b }
/exe @divide(a, b) = js { return a / b }

/exe @calculate(op, a, b) = when: [
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
/exe @format(type, data) = when: [
  @type == "json" => @data | @json
  @type == "pretty" => @data | @json
  true => @data
]

/var @myData = { name: "Test", value: 42 }

Formatted output:
/show @format("json", @myData)
/show @format("pretty", @myData)
/show @format("plain", "just text")
