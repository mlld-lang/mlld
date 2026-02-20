# Python Undefined Parameter Handling

Tests that Python executables handle undefined/missing parameters gracefully.

## Test function with optional parameters

/exe @greet(name, title, suffix) = py {
greeting = "Hello"

if title is not None and title != 'None':
    greeting += ", " + str(title)

greeting += " " + str(name)

if suffix is not None and suffix != 'None':
    greeting += " " + str(suffix)

print(greeting + "!")
}

/var @greeting1 = @greet("Alice", "Dr.", "PhD")
/show @greeting1

/var @greeting2 = @greet("Bob")
/show @greeting2

## Test checking parameter types

/exe @checkParams(a, b, c, d) = py {
def format_param(name, val):
    if val is None or val == 'None':
        return f"{name}: None"
    return f"{name}: {type(val).__name__} = {val}"

results = []
results.append(format_param("a", a))
results.append(format_param("b", b))
results.append(format_param("c", c))
results.append(format_param("d", d))

print(", ".join(results))
}

/var @params1 = @checkParams("first")
/show @params1

/var @params2 = @checkParams("one", "two")
/show @params2

/var @params3 = @checkParams("x", "y", "z", "w")
/show @params3
