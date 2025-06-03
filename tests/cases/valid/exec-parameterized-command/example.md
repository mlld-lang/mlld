# Parameterized Exec Command (Valid)

This example shows the correct way to create a parameterized command using `@exec`.

@exec greet(name, times) = @run [echo "Hello @name!" && echo "Welcome @name!" && echo "Greetings @name!"]

@run @greet("Alice", "3")