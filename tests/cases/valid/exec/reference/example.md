@exec echo (text) = @run [(echo "@text")]
@exec greet (name) = @run [(echo "Hello, @name!")]
@run @greet("World")