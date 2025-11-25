# Parameter Interpolation Test

This test verifies that @param syntax works consistently in exec functions across:
1. Direct exec calls
2. Foreach with exec
3. Command templates vs code templates
4. Special characters and escaping

## Command Template Tests

/exe @greet(name) = cmd {echo "Hello, @name!"}
/exe @greetQuoted(name) = cmd {echo "Greetings, '@name'"}
/exe @greetSpecial(name) = cmd {echo "Welcome @name (special: \$@name)"}

Direct calls:
/run @greet("Alice")
/run @greetQuoted("Bob's Place")
/run @greetSpecial("Charlie & Co.")

## Code Template Tests

/exe @jsGreet(name) = javascript {
  console.log(`JS says hello to ${name}!`);
}

/exe @bashGreet(name) = bash {
  echo "Bash says hi to $name!"
}

Direct calls:
/run @jsGreet("David")
/run @bashGreet("Eve")

## Foreach Tests

/var @names = ["Frank", "Grace's Shop", "Henry & Sons"]
/var @greetings = foreach @greet(@names)
/show @greetings

/var @jsGreetings = foreach @jsGreet(@names)
/show @jsGreetings

## Multiple Parameters

/exe @introduce(first, last) = cmd {echo "@first @last"}
/var @firstNames = ["Ian", "Jane"]
/var @lastNames = ["Smith", "O'Brien"]
/var @intros = foreach @introduce(@firstNames, @lastNames)
/show @intros

## Nested Variable References

/var @myName = "Kate"
/exe @greetVariable(prefix) = cmd {echo "@prefix @myName!"}
/run @greetVariable("Hello")