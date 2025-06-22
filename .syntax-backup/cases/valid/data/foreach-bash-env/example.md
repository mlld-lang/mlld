# Test: foreach with bash commands accessing parameters as environment variables

@data names = ["Alice", "Bob", "Charlie"]
@data scores = [95, 87, 92]

@exec greet(name) = bash [(echo "Hello, $name!")]
@exec report(name, score) = bash [(echo "$name scored $score points")]

# Single parameter bash command
@data greetings = foreach @greet(@names)
@add @greetings

---

# Multiple parameter bash command
@data reports = foreach @report(@names, @scores)
@add @reports