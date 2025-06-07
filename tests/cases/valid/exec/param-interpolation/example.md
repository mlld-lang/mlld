# Parameter Interpolation Test

This test verifies that @param syntax works consistently in exec functions across:
1. Direct exec calls
2. Foreach with exec
3. Command templates vs code templates
4. Special characters and escaping

## Command Template Tests

@exec greet (name) = @run [(echo "Hello, @name!")]
@exec greetQuoted (name) = @run [(echo "Greetings, '@name'")]
@exec greetSpecial (name) = @run [(echo "Welcome @name (special: $\@name)")]

Direct calls:
@run @greet("Alice")
@run @greetQuoted("Bob's Place")
@run @greetSpecial("Charlie & Co.")

## Code Template Tests

@exec jsGreet (name) = @run javascript [(
  console.log(`JS says hello to ${name}!`);
)]

@exec bashGreet (name) = @run bash [(
  echo "Bash says hi to $name!"
)]

Direct calls:
@run @jsGreet("David")
@run @bashGreet("Eve")

## Foreach Tests

@data names = ["Frank", "Grace's Shop", "Henry & Sons"]
@data greetings = foreach @greet(@names)
@add @greetings

@data jsGreetings = foreach @jsGreet(@names)
@add @jsGreetings

## Multiple Parameters

@exec introduce (first, last) = @run [(echo "@first @last")]
@data firstNames = ["Ian", "Jane"]
@data lastNames = ["Smith", "O'Brien"]
@data intros = foreach @introduce(@firstNames, @lastNames)
@add @intros

## Nested Variable References

@text myName = "Kate"
@exec greetVariable (prefix) = @run [(echo "@prefix @myName!")]
@run @greetVariable("Hello")