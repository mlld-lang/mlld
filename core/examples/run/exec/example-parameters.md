@exec greetCommand(param) = @run [echo "Hello, @param"]
@run @greetCommand("World")