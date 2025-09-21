# Test: foreach with bash commands accessing parameters as environment variables

/var @names = ["Alice", "Bob", "Charlie"]
/var @scores = [95, 87, 92]

/exe @greet(name) = bash {echo "Hello, $name!"}
/exe @report(name, score) = bash {echo "$name scored $score points"}

# Single parameter bash command
/var @greetings = foreach @greet(@names)
/show @greetings

---

# Multiple parameter bash command
/var @reports = foreach @report(@names, @scores)
/show @reports